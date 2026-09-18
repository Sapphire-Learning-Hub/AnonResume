import { runAiMaintenance } from "@/lib/ai/maintenance";
import { getDatabasePool } from "@/lib/runtime/database";

function maintenanceBatchSize(value: string | undefined) {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 1_000) {
    throw new Error("AI_MAINTENANCE_BATCH_SIZE must be an integer from 1 to 1000");
  }
  return parsed;
}

try {
  const result = await runAiMaintenance({
    batchSize: maintenanceBatchSize(process.env.AI_MAINTENANCE_BATCH_SIZE),
  });
  if (!result.acquired) {
    console.info("[AnonResume] AI maintenance skipped because another run is active");
  } else {
    console.info(
      `[AnonResume] AI maintenance completed: interrupted=${result.interrupted}, settlementPending=${result.settlementPending}, renewedQuotas=${result.renewedQuotas}, deletedEvidence=${result.deletedEvidence}`,
    );
  }
} finally {
  await getDatabasePool().end();
}
