import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";

initializeLogging({ role: "maintenance" });
const aiLog = getLogger("anonresume.ai");
const { runAiMaintenance } = await import("@/lib/ai/maintenance");
const { getRuntimeConfigManager } = await import("@/lib/config/runtime");
const { getDatabasePool } = await import("@/lib/runtime/database");
const runtimeManager = getRuntimeConfigManager("ai-worker");

try {
  await runtimeManager.start();
  const runtime = await runtimeManager.snapshot();
  const result = await runAiMaintenance({ batchSize: runtime.values.aiWorkerBatchSize });
  aiLog.info("maintenance_completed", {
    labels: {
      deletedEvidence: result.retention.acquired ? result.retention.deletedEvidence : 0,
      interrupted: result.recovery.acquired ? result.recovery.interrupted : 0,
      settlementPending: result.recovery.acquired ? result.recovery.settlementPending : 0,
    },
    outcome: "success",
  });
} catch (error) {
  aiLog.error("maintenance_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
} finally {
  await runtimeManager.stop();
  await getDatabasePool().end();
}
