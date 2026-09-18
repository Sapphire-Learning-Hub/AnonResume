import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function deleteExpiredAiAuditEvidence({
  now = new Date(),
  batchSize = 100,
}: {
  now?: Date;
  batchSize?: number;
} = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > 1_000) {
    throw new Error("invalid_ai_audit_batch_size");
  }
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const result = await getDatabasePool().query(
    `WITH expired AS (
       SELECT id
         FROM ${schema}.ai_audit_payloads
        WHERE expires_at <= $1
        ORDER BY expires_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM ${schema}.ai_audit_payloads payload
      USING expired
      WHERE payload.id = expired.id
     RETURNING payload.id`,
    [now, batchSize],
  );
  return result.rowCount ?? 0;
}
