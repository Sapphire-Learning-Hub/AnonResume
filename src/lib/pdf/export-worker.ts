import { hostname } from "node:os";
import { randomUUID } from "node:crypto";

import {
  claimPdfExportJobs,
  createPdfExportWorkerToken,
  deleteExpiredPdfExportResults,
  failPdfExport,
  getPdfExportQueueConfig,
  renewPdfExportLease,
  completePdfExport,
} from "@/lib/pdf/export-queue";
import { exportResumePdf } from "@/lib/pdf/render";
import { PDF_EXPORT_WORKER_COOKIE } from "@/lib/http/request-authorization";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";
import {
  resolveApplicationOriginForBootstrap,
  validateRuntimeConfiguration,
} from "@/lib/runtime/configuration";
import { recordWorkerHeartbeat } from "@/lib/runtime/worker-heartbeat";

const PRINT_READY_FLAG = "__ANON_RESUME_PRINT_READY__";
const IDLE_POLL_MS = 1_000;
const MAX_CLEANUP_INTERVAL_MS = 60_000;

type ClaimedPdfExportJob = Awaited<
  ReturnType<typeof claimPdfExportJobs>
>[number];

type PdfExporter = typeof exportResumePdf;

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
    leaseMs: number;
    resultTtlMs: number;
    exportPdf?: PdfExporter;
  },
) {
  const controller = new AbortController();
  const exportPdf = options.exportPdf ?? exportResumePdf;
  const heartbeatMs = Math.min(
    1_000,
    Math.max(250, Math.floor(options.leaseMs / 3)),
  );
  const heartbeat = setInterval(() => {
    void renewPdfExportLease({
      jobId: job.id,
      workerId: options.workerId,
      leaseMs: options.leaseMs,
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
    const printUrl = new URL(
      `/pdf-export/${job.id}/print`,
      options.appOrigin,
    );

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
      leaseMs: options.leaseMs,
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
      resultTtlMs: options.resultTtlMs,
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
  appOrigin?: string;
}) {
  const configuration = validateRuntimeConfiguration(process.env);

  if (!configuration.valid) {
    throw new Error(
      `Invalid production configuration: ${configuration.issues.join(", ")}`,
    );
  }

  const config = getPdfExportQueueConfig();
  const workerId =
    options?.workerId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const appOrigin =
    options?.appOrigin ?? resolveApplicationOriginForBootstrap(process.env);
  const cleanupIntervalMs = Math.min(
    MAX_CLEANUP_INTERVAL_MS,
    config.forceExpiryMs,
  );
  let lastCleanupAt = 0;
  const startedAt = new Date();
  const release = getApplicationRelease();

  while (!options?.signal?.aborted) {
    const now = Date.now();

    await recordWorkerHeartbeat({
      workerId,
      workerType: "pdf-export",
      release,
      startedAt,
      metadata: { maxConcurrency: config.maxConcurrency },
      now: new Date(now),
    });

    if (now - lastCleanupAt >= cleanupIntervalMs) {
      await deleteExpiredPdfExportResults({
        forceExpiryMs: config.forceExpiryMs,
      });
      lastCleanupAt = now;
    }

    const jobs = await claimPdfExportJobs({
      workerId,
      maxConcurrency: config.maxConcurrency,
      maxAttempts: config.maxAttempts,
      leaseMs: config.leaseMs,
    });

    if (jobs.length === 0) {
      await delay(IDLE_POLL_MS, options?.signal);
      continue;
    }

    await Promise.all(
      jobs.map((job) =>
        processPdfExportJob(job, {
          workerId,
          appOrigin,
          leaseMs: config.leaseMs,
          resultTtlMs: config.resultTtlMs,
        }),
      ),
    );
  }
}
