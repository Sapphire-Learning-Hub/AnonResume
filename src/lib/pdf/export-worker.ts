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
import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";
import { applicationMetrics } from "@/lib/observability/metrics";
import { withTaskDiagnostics, recordDiagnosticFailure } from "@/lib/observability/diagnostics/tasks";
import { finishDiagnosticTask } from "@/lib/observability/diagnostics/store/runtime";
import { withDiagnosticSpan } from "@/lib/observability/tracing/span";

const PRINT_READY_FLAG = "__ANON_RESUME_PRINT_READY__";
const IDLE_POLL_MS = 1_000;
const MAX_CLEANUP_INTERVAL_MS = 60_000;
const pdfLog = getLogger("anonresume.pdf");
const runtimeLog = getLogger("anonresume.runtime");

type ClaimedPdfExportJob = Awaited<
  ReturnType<typeof claimPdfExportJobs>
>[number];

type PdfExporter = typeof exportResumePdf;
type PdfRuntimeManager = Pick<
  RuntimeConfigManager,
  "refreshIfDue" | "snapshot" | "start"
>;

function getErrorMessage(error: unknown) {
  return serializeSafeError(error).code ?? "pdf_export_failed";
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

export function processPdfExportJob(job: ClaimedPdfExportJob, options: Parameters<typeof executePdfExportJob>[1]) {
  return withTaskDiagnostics(job.id, job.diagnosticContext, "pdf", () => executePdfExportJob(job, options));
}

async function executePdfExportJob(
  job: ClaimedPdfExportJob,
  options: {
    workerId: string;
    appOrigin: string;
    configuration: Readonly<PdfExportConfiguration>;
    exportPdf?: PdfExporter;
  },
) {
  const startedAt = process.hrtime.bigint();
  let outcome: "cancelled" | "failure" | "success" = "failure";
  applicationMetrics.recordJobStarted({
    jobType: "pdf",
    queueWaitSeconds: Math.max(
      0,
      (Date.now() - job.createdAt.getTime()) / 1_000,
    ),
  });
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

    const result = await withDiagnosticSpan("app.pdf.render",() => exportPdf({
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
    }));
    const cancelRequested = await renewPdfExportLease({
      jobId: job.id,
      workerId: options.workerId,
      leaseMs: options.configuration.leaseMs,
    });

    if (cancelRequested) {
      outcome = "cancelled";
      await failPdfExport({
        jobId: job.id,
        workerId: options.workerId,
        error: "cancelled",
        cancelled: true,
      });
      return;
    }

    await withDiagnosticSpan("app.pdf.save",() => completePdfExport({
      jobId: job.id,
      workerId: options.workerId,
      result,
      configuration: options.configuration,
    }));
    outcome = "success";
    pdfLog.info("export_completed", {
      durationNs: Number(process.hrtime.bigint() - startedAt),
      outcome: "success",
      transactionId: job.id,
    });
  } catch (error) {
    outcome = controller.signal.aborted ? "cancelled" : "failure";
    if (!controller.signal.aborted) recordDiagnosticFailure(error, "pdf.render", job.id);
    await failPdfExport({
      jobId: job.id,
      workerId: options.workerId,
      error: getErrorMessage(error),
      cancelled: controller.signal.aborted,
    });
    pdfLog.error("export_failed", {
      durationNs: Number(process.hrtime.bigint() - startedAt),
      error: serializeSafeError(error),
      labels: { cancelled: controller.signal.aborted },
      outcome: "failure",
      transactionId: job.id,
    });
  } finally {
    finishDiagnosticTask(job.id,"pdf",outcome);
    applicationMetrics.recordJobCompleted({
      durationSeconds: Number(process.hrtime.bigint() - startedAt) /
        1_000_000_000,
      jobType: "pdf",
      outcome,
    });
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
  let heartbeatFailed = false;

  console.info(`[AnonResume] PDF worker started: ${workerId}`);
  runtimeLog.info("worker_started", {
    labels: { workerType: "pdf-export" },
    outcome: "success",
  });

  while (!options?.signal?.aborted) {
    await runtime.refreshIfDue();
    const snapshot = await runtime.snapshot();
    const config = getPdfExportQueueConfig(snapshot.values);
    const now = Date.now();

    try {
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
      applicationMetrics.recordWorkerHeartbeat({
        outcome: "success",
        workerType: "pdf",
      });
      if (heartbeatFailed) {
        heartbeatFailed = false;
        runtimeLog.info("worker_heartbeat_recovered", {
          labels: { workerType: "pdf-export" },
          outcome: "success",
        });
      }
    } catch (error) {
      applicationMetrics.recordWorkerHeartbeat({
        outcome: "failure",
        workerType: "pdf",
      });
      applicationMetrics.recordWorkerOperationFailure({
        operation: "heartbeat",
        workerType: "pdf",
      });
      if (!heartbeatFailed) {
        heartbeatFailed = true;
        runtimeLog.error("worker_heartbeat_failed", {
          error: serializeSafeError(error),
          labels: { workerType: "pdf-export" },
          outcome: "failure",
        });
      }
    }

    const cleanupIntervalMs = Math.min(
      MAX_CLEANUP_INTERVAL_MS,
      config.forceExpiryMs,
    );
    if (now - lastCleanupAt >= cleanupIntervalMs) {
      try {
        await deleteExpiredPdfExportResults(config);
      } catch (error) {
        applicationMetrics.recordWorkerOperationFailure({
          operation: "cleanup",
          workerType: "pdf",
        });
        throw error;
      }
      lastCleanupAt = now;
    }

    let jobs: Awaited<ReturnType<typeof claimPdfExportJobs>>;
    try {
      jobs = await claimPdfExportJobs({
        workerId: leaseOwner,
        configuration: config,
      });
    } catch (error) {
      applicationMetrics.recordWorkerOperationFailure({
        operation: "claim",
        workerType: "pdf",
      });
      throw error;
    }

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
  runtimeLog.info("worker_stopped", {
    labels: { workerType: "pdf-export" },
    outcome: "success",
  });
}
