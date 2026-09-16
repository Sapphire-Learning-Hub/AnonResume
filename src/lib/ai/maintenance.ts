import { deleteExpiredAiAuditEvidence } from "@/lib/ai/audit/retention";
import {
  recoverExpiredAiRuns,
  renewExpiredAiQuotaPeriods,
} from "@/lib/ai/runs/recovery";
import { getDatabasePool } from "@/lib/runtime/database";

const MAINTENANCE_LOCK = "anonresume:ai-maintenance";

export async function runAiMaintenance(input: {
  batchSize?: number;
  now?: Date;
} = {}) {
  const client = await getDatabasePool().connect();
  let acquired = false;

  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [MAINTENANCE_LOCK],
    );
    acquired = Boolean(lock.rows[0]?.acquired);
    if (!acquired) return { acquired: false as const };

    const options = { batchSize: input.batchSize, now: input.now };
    const runs = await recoverExpiredAiRuns(options);
    const renewedQuotas = await renewExpiredAiQuotaPeriods(options);
    const deletedEvidence = await deleteExpiredAiAuditEvidence(options);
    return {
      acquired: true as const,
      deletedEvidence,
      renewedQuotas,
      ...runs,
    };
  } finally {
    if (acquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        MAINTENANCE_LOCK,
      ]).catch(() => undefined);
    }
    client.release();
  }
}
