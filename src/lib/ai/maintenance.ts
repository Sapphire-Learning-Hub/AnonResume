import { deleteExpiredAiAuditEvidence } from "@/lib/ai/audit/retention";
import { recoverExpiredAiRuns } from "@/lib/ai/runs/recovery";
import { getDatabasePool } from "@/lib/runtime/database";

const RECOVERY_LOCK = "anonresume:ai-recovery";
const RETENTION_LOCK = "anonresume:ai-audit-retention";

async function withMaintenanceLock<T extends object>(
  lockName: string,
  operation: () => Promise<T>,
): Promise<{ acquired: false } | ({ acquired: true } & T)> {
  const client = await getDatabasePool().connect();
  let acquired = false;

  try {
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lockName],
    );
    acquired = Boolean(lock.rows[0]?.acquired);
    if (!acquired) return { acquired: false };

    return { acquired: true, ...(await operation()) };
  } finally {
    if (acquired) {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [lockName])
        .catch(() => undefined);
    }
    client.release();
  }
}

export async function runAiRecoveryMaintenance(input: {
  batchSize?: number;
  now?: Date;
} = {}) {
  return withMaintenanceLock(RECOVERY_LOCK, () =>
    recoverExpiredAiRuns(input),
  );
}

export async function runAiRetentionMaintenance(input: {
  batchSize?: number;
  now?: Date;
} = {}) {
  return withMaintenanceLock(RETENTION_LOCK, async () => ({
    deletedEvidence: await deleteExpiredAiAuditEvidence(input),
  }));
}

export async function runAiMaintenance(input: {
  batchSize?: number;
  now?: Date;
} = {}) {
  const recovery = await runAiRecoveryMaintenance(input);
  const retention = await runAiRetentionMaintenance(input);
  return { recovery, retention };
}
