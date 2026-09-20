import { runAiMaintenance } from "@/lib/ai/maintenance";
import { getRuntimeConfigManager } from "@/lib/config/runtime";
import { getDatabasePool } from "@/lib/runtime/database";

const runtimeManager = getRuntimeConfigManager("ai-worker");

try {
  await runtimeManager.start();
  const runtime = await runtimeManager.snapshot();
  const result = await runAiMaintenance({
    batchSize: runtime.values.aiWorkerBatchSize,
  });
  const recovery = result.recovery.acquired
    ? `interrupted=${result.recovery.interrupted}, settlementPending=${result.recovery.settlementPending}`
    : "skipped";
  const retention = result.retention.acquired
    ? `deletedEvidence=${result.retention.deletedEvidence}`
    : "skipped";
  console.info(
    `[AnonResume] AI maintenance completed: recovery=${recovery}, retention=${retention}`,
  );
} finally {
  await runtimeManager.stop();
  await getDatabasePool().end();
}
