import { adminAuditEvents, db, getDatabaseSchemaName } from "@/db";
import type { PoolClient } from "pg";

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "accesstoken",
  "secret",
  "encryptedsecret",
  "code",
  "recoverycode",
  "recoverycodes",
  "document",
  "content",
  "result",
]);

function normalizedMetadataKey(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FORBIDDEN_METADATA_KEYS.has(normalizedMetadataKey(key)))
      .map(([key, nested]) => [key, sanitizeValue(nested)]),
  );
}

export function sanitizeAdminAuditMetadata(value: Record<string, unknown>) {
  return sanitizeValue(value) as Record<string, unknown>;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export interface AdminAuditEventInput {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: "success" | "denied" | "failed";
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ipHash?: string | null;
}

export async function writeAdminAuditEventWithClient(
  client: PoolClient,
  input: AdminAuditEventInput,
) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  await client.query(
    `INSERT INTO ${schema}.admin_audit_events
      (actor_user_id, action, target_type, target_id, outcome, metadata,
       request_id, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      input.actorUserId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.outcome,
      JSON.stringify(sanitizeAdminAuditMetadata(input.metadata ?? {})),
      input.requestId ?? null,
      input.ipHash ?? null,
    ],
  );
}

export async function writeAdminAuditEvent(input: AdminAuditEventInput) {
  await db.insert(adminAuditEvents).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    outcome: input.outcome,
    metadata: sanitizeAdminAuditMetadata(input.metadata ?? {}),
    requestId: input.requestId ?? null,
    ipHash: input.ipHash ?? null,
  });
}
