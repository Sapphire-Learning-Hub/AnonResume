import { getDatabasePool } from "@/lib/runtime/database";
import { runPdfExportWorker } from "@/lib/pdf/export-worker";
import { getRuntimeConfigManager } from "@/lib/config/runtime";
import { withWorkerInstanceLock } from "@/lib/runtime/worker-instance-lock";

const controller = new AbortController();
const stop = () => controller.abort();
const runtimeManager = getRuntimeConfigManager("pdf-worker");

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runtimeManager.start();
  const identity = await runtimeManager.snapshot();
  await withWorkerInstanceLock(identity.instanceId, () =>
    runPdfExportWorker({
      signal: controller.signal,
      runtimeManager,
    })
  );
} finally {
  await runtimeManager.stop();
  await getDatabasePool().end();
}
