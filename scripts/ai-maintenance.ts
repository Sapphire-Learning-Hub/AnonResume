import { runAiMaintenance } from "@/lib/ai/maintenance";
import { getDatabasePool } from "@/lib/runtime/database";

function maintenanceBatchSize(value: string | undefined) {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 1_000) {
    throw new Error("AI worker batch size must be an integer from 1 to 1000");
  }
  return parsed;
}

try {
  const result = await runAiMaintenance({
    batchSize: maintenanceBatchSize(
      process.env.AI_WORKER_BATCH_SIZE ??
        process.env.AI_MAINTENANCE_BATCH_SIZE,
    ),
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
  await getDatabasePool().end();
}
