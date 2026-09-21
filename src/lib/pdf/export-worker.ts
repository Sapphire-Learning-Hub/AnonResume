import {
  claimPdfExportJobs,
  createPdfExportWorkerToken,
  deleteExpiredPdfExportResults,
  failPdfExport,
  getPdfExportQueueConfig,
  type PdfExportConfiguration,
  renewPdfExportLease,
  completePdfExport,
} from "@/lib/pdf/export-queue";
import {
  getRuntimeConfigManager,
  type RuntimeConfigManager,
} from "@/lib/config/runtime";
import { exportResumePdf } from "@/lib/pdf/render";
import { PDF_EXPORT_WORKER_COOKIE } from "@/lib/http/request-authorization";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";
import { createLeaseOwner } from "@/lib/runtime/instance-identity";
import {
  resolveApplicationOriginForBootstrap,
  validateBootstrapConfiguration,
} from "@/lib/runtime/configuration";
import {
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "@/lib/runtime/worker-heartbeat";

const PRINT_READY_FLAG = "__ANON_RESUME_PRINT_READY__";
const IDLE_POLL_MS = 1_000;
const MAX_CLEANUP_INTERVAL_MS = 60_000;

type ClaimedPdfExportJob = Awaited<
  ReturnType<typeof claimPdfExportJobs>
>[number];

type PdfExporter = typeof exportResumePdf;
type PdfRuntimeManager = Pick<
  RuntimeConfigManager,
  "refreshIfDue" | "snapshot" | "start"
>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "PDF export failed";
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export async function processPdfExportJob(
  job: ClaimedPdfExportJob,
  options: {
    workerId: string;
    appOrigin: string;
    configuration: Readonly<PdfExportConfiguration>;
    exportPdf?: PdfExporter;
  },
) {
  const controller = new AbortController();
  const exportPdf = options.exportPdf ?? exportResumePdf;
  const heartbeatMs = Math.min(
    1_000,
    Math.max(250, Math.floor(options.configuration.leaseMs / 3)),
  );
  const heartbeat = setInterval(() => {
    void renewPdfExportLease({
      jobId: job.id,
      workerId: options.workerId,
      leaseMs: options.configuration.leaseMs,
    })
      .then((cancelRequested) => {
        if (cancelRequested) {
          controller.abort();
        }
      })
      .catch(() => controller.abort());
  }, heartbeatMs);

  heartbeat.unref();

  try {
    const workerToken = createPdfExportWorkerToken(job.id);
    const printUrl = new URL(`/pdf-export/${job.id}/print`, options.appOrigin);

    const result = await exportPdf({
      printUrl: printUrl.toString(),
      readyFlag: PRINT_READY_FLAG,
      requestCookies: [
        {
          name: PDF_EXPORT_WORKER_COOKIE,
          value: workerToken,
          domain: printUrl.hostname,
          path: "/pdf-export/",
          expires: -1,
          httpOnly: true,
          secure: printUrl.protocol === "https:",
          sameSite: "Strict",
        },
      ],
      signal: controller.signal,
    });
    const cancelRequested = await renewPdfExportLease({
      jobId: job.id,
      workerId: options.workerId,
      leaseMs: options.configuration.leaseMs,
    });

    if (cancelRequested) {
      await failPdfExport({
        jobId: job.id,
        workerId: options.workerId,
        error: "cancelled",
        cancelled: true,
      });
      return;
    }

    await completePdfExport({
      jobId: job.id,
      workerId: options.workerId,
      result,
      configuration: options.configuration,
    });
  } catch (error) {
    await failPdfExport({
      jobId: job.id,
      workerId: options.workerId,
      error: getErrorMessage(error),
      cancelled: controller.signal.aborted,
    });
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runPdfExportWorker(options?: {
  signal?: AbortSignal;
  workerId?: string;
  sessionId?: string;
  appOrigin?: string;
  runtimeManager?: PdfRuntimeManager;
  processJob?: typeof processPdfExportJob;
  idlePollMs?: number;
}) {
  const configuration = validateBootstrapConfiguration();

  if (!configuration.valid) {
    throw new Error(
      `Invalid production configuration: ${configuration.issues.join(", ")}`,
    );
  }

  const runtime =
    options?.runtimeManager ?? getRuntimeConfigManager("pdf-worker");
  await runtime.start();
  const initialSnapshot = await runtime.snapshot();
  const workerId = options?.workerId ?? initialSnapshot.instanceId;
  const sessionId = options?.sessionId ?? initialSnapshot.sessionId ?? workerId;
  const leaseOwner = createLeaseOwner({ stableId: workerId, sessionId });
  const appOrigin =
    options?.appOrigin ?? resolveApplicationOriginForBootstrap();
  let lastCleanupAt = 0;
  const startedAt = new Date();
  const release = getApplicationRelease();
  const activeJobs = new Set<Promise<void>>();
  const processJob = options?.processJob ?? processPdfExportJob;

  while (!options?.signal?.aborted) {
    await runtime.refreshIfDue();
    const snapshot = await runtime.snapshot();
    const config = getPdfExportQueueConfig(snapshot.values);
    const now = Date.now();

    await recordWorkerHeartbeat({
      workerId,
      sessionId,
      workerType: "pdf-export",
      release,
      startedAt,
      metadata: {
        configurationHealth: snapshot.health,
        desiredRevisionId: snapshot.desiredRevisionId,
        hotRevisionId: snapshot.hotRevisionId,
        maxConcurrency: config.maxConcurrency,
        restartRevisionId: snapshot.restartRevisionId,
      },
      now: new Date(now),
    });

    const cleanupIntervalMs = Math.min(
      MAX_CLEANUP_INTERVAL_MS,
      config.forceExpiryMs,
    );
    if (now - lastCleanupAt >= cleanupIntervalMs) {
      await deleteExpiredPdfExportResults(config);
      lastCleanupAt = now;
    }

    const jobs = await claimPdfExportJobs({
      workerId: leaseOwner,
      configuration: config,
    });

    if (jobs.length === 0) {
      await delay(options?.idlePollMs ?? IDLE_POLL_MS, options?.signal);
      continue;
    }

    for (const job of jobs) {
      const processing = processJob(job, {
        workerId: leaseOwner,
        appOrigin,
        configuration: config,
      }).finally(() => activeJobs.delete(processing));
      activeJobs.add(processing);
    }
  }

  await Promise.allSettled(activeJobs);
  await markWorkerStopped({ workerId, sessionId });
}
