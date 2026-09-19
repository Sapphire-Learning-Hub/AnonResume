import { and, count, eq, gte, isNotNull } from "drizzle-orm";

import {
  adminMfaDevices,
  aiAuditPayloads,
  aiProviderCredentials,
  aiRuns,
  db,
  workerHeartbeats,
} from "@/db";
import {
  decryptVersionedAdminMfaSecret,
  encryptAdminMfaSecret,
} from "@/lib/admin/crypto";
import {
  decryptVersionedAiCredential,
  encryptAiCredential,
} from "@/lib/ai/security/credentials";
import type { ConfigKeyring } from "@/lib/config/crypto";
import {
  createVersionedSecretKeys,
  DERIVED_SECRET_KEY_VERSION,
  LEGACY_SECRET_KEY_VERSION,
} from "@/lib/config/secret-keyring";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_WORKER_STALE_MS = 15_000;

export interface LegacySecretCounts {
  adminMfaDevices: number;
  aiAuditPayloads: number;
  aiProviderCredentials: number;
  aiRuns: number;
  total: number;
}

export class SecretMigrationWorkerActiveError extends Error {
  constructor() {
    super("ai_worker_must_be_stopped");
    this.name = "SecretMigrationWorkerActiveError";
  }
}

function positiveBatchSize(value: number | undefined) {
  const resolved = value ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > 1_000) {
    throw new Error("Secret migration batch size must be between 1 and 1000");
  }
  return resolved;
}

export async function countLegacySecrets(): Promise<LegacySecretCounts> {
  const [admin, providers, runs, audit] = await Promise.all([
    db.select({ value: count() }).from(adminMfaDevices)
      .where(eq(adminMfaDevices.keyVersion, LEGACY_SECRET_KEY_VERSION)),
    db.select({ value: count() }).from(aiProviderCredentials)
      .where(eq(
        aiProviderCredentials.encryptionKeyVersion,
        LEGACY_SECRET_KEY_VERSION,
      )),
    db.select({ value: count() }).from(aiRuns)
      .where(and(
        eq(aiRuns.executionPayloadKeyVersion, LEGACY_SECRET_KEY_VERSION),
        isNotNull(aiRuns.encryptedExecutionPayload),
      )),
    db.select({ value: count() }).from(aiAuditPayloads)
      .where(eq(
        aiAuditPayloads.encryptionKeyVersion,
        LEGACY_SECRET_KEY_VERSION,
      )),
  ]);
  const counts = {
    adminMfaDevices: admin[0]?.value ?? 0,
    aiProviderCredentials: providers[0]?.value ?? 0,
    aiRuns: runs[0]?.value ?? 0,
    aiAuditPayloads: audit[0]?.value ?? 0,
  };
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

async function hasFreshAiWorker(input: { now: Date; staleMs: number }) {
  const [row] = await db
    .select({ workerId: workerHeartbeats.workerId })
    .from(workerHeartbeats)
    .where(and(
      eq(workerHeartbeats.workerType, "ai-runtime"),
      gte(
        workerHeartbeats.lastSeenAt,
        new Date(input.now.getTime() - input.staleMs),
      ),
    ))
    .limit(1);
  return Boolean(row);
}

async function migrateAdminMfaBatch(input: {
  batchSize: number;
  currentKey: Buffer;
  keys: ReturnType<typeof createVersionedSecretKeys>;
}) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(adminMfaDevices)
      .where(eq(adminMfaDevices.keyVersion, LEGACY_SECRET_KEY_VERSION))
      .limit(input.batchSize)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      const plaintext = decryptVersionedAdminMfaSecret(
        row,
        row.keyVersion,
        input.keys,
      );
      await transaction
        .update(adminMfaDevices)
        .set({
          ...encryptAdminMfaSecret(plaintext, input.currentKey),
          keyVersion: DERIVED_SECRET_KEY_VERSION,
        })
        .where(and(
          eq(adminMfaDevices.id, row.id),
          eq(adminMfaDevices.keyVersion, LEGACY_SECRET_KEY_VERSION),
        ));
    }
    return rows.length;
  });
}

async function migrateProviderBatch(input: {
  batchSize: number;
  currentKey: Buffer;
  keys: ReturnType<typeof createVersionedSecretKeys>;
}) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: aiProviderCredentials.id,
        encryptedApiKey: aiProviderCredentials.encryptedApiKey,
        keyVersion: aiProviderCredentials.encryptionKeyVersion,
      })
      .from(aiProviderCredentials)
      .where(eq(
        aiProviderCredentials.encryptionKeyVersion,
        LEGACY_SECRET_KEY_VERSION,
      ))
      .limit(input.batchSize)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      const plaintext = decryptVersionedAiCredential(
        row.encryptedApiKey,
        row.keyVersion,
        input.keys,
      );
      await transaction
        .update(aiProviderCredentials)
        .set({
          encryptedApiKey: encryptAiCredential(plaintext, input.currentKey),
          encryptionKeyVersion: DERIVED_SECRET_KEY_VERSION,
        })
        .where(and(
          eq(aiProviderCredentials.id, row.id),
          eq(
            aiProviderCredentials.encryptionKeyVersion,
            LEGACY_SECRET_KEY_VERSION,
          ),
        ));
    }
    return rows.length;
  });
}

async function migrateRunBatch(input: {
  batchSize: number;
  currentKey: Buffer;
  keys: ReturnType<typeof createVersionedSecretKeys>;
}) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: aiRuns.id,
        encryptedPayload: aiRuns.encryptedExecutionPayload,
        keyVersion: aiRuns.executionPayloadKeyVersion,
      })
      .from(aiRuns)
      .where(and(
        eq(aiRuns.executionPayloadKeyVersion, LEGACY_SECRET_KEY_VERSION),
        isNotNull(aiRuns.encryptedExecutionPayload),
      ))
      .limit(input.batchSize)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      const plaintext = decryptVersionedAiCredential(
        row.encryptedPayload!,
        row.keyVersion!,
        input.keys,
      );
      await transaction
        .update(aiRuns)
        .set({
          encryptedExecutionPayload: encryptAiCredential(
            plaintext,
            input.currentKey,
          ),
          executionPayloadKeyVersion: DERIVED_SECRET_KEY_VERSION,
        })
        .where(and(
          eq(aiRuns.id, row.id),
          eq(aiRuns.executionPayloadKeyVersion, LEGACY_SECRET_KEY_VERSION),
        ));
    }
    return rows.length;
  });
}

async function migrateAuditBatch(input: {
  batchSize: number;
  currentKey: Buffer;
  keys: ReturnType<typeof createVersionedSecretKeys>;
}) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(aiAuditPayloads)
      .where(eq(
        aiAuditPayloads.encryptionKeyVersion,
        LEGACY_SECRET_KEY_VERSION,
      ))
      .limit(input.batchSize)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      const request = decryptVersionedAiCredential(
        row.encryptedRequest,
        row.encryptionKeyVersion,
        input.keys,
      );
      const response = row.encryptedResponse
        ? decryptVersionedAiCredential(
            row.encryptedResponse,
            row.encryptionKeyVersion,
            input.keys,
          )
        : null;
      await transaction
        .update(aiAuditPayloads)
        .set({
          encryptedRequest: encryptAiCredential(request, input.currentKey),
          encryptedResponse: response === null
            ? null
            : encryptAiCredential(response, input.currentKey),
          encryptionKeyVersion: DERIVED_SECRET_KEY_VERSION,
        })
        .where(and(
          eq(aiAuditPayloads.id, row.id),
          eq(
            aiAuditPayloads.encryptionKeyVersion,
            LEGACY_SECRET_KEY_VERSION,
          ),
        ));
    }
    return rows.length;
  });
}

async function drainBatches(operation: () => Promise<number>) {
  for (;;) {
    const migrated = await operation();
    if (migrated === 0) return;
  }
}

export async function migrateLegacySecrets(input: {
  apply?: boolean;
  batchSize?: number;
  keyring: ConfigKeyring;
  legacyAdminMfaKey?: Buffer;
  legacyAiCredentialsKey?: Buffer;
  now?: Date;
  workerStaleMs?: number;
  workerStopped?: boolean;
}) {
  const counts = await countLegacySecrets();
  if (!input.apply || counts.total === 0) {
    return { applied: Boolean(input.apply), counts };
  }
  if (
    counts.aiRuns + counts.aiAuditPayloads > 0 &&
    !input.workerStopped &&
    await hasFreshAiWorker({
      now: input.now ?? new Date(),
      staleMs: input.workerStaleMs ?? DEFAULT_WORKER_STALE_MS,
    })
  ) {
    throw new SecretMigrationWorkerActiveError();
  }

  const batchSize = positiveBatchSize(input.batchSize);
  const adminKeys = createVersionedSecretKeys({
    keyring: input.keyring,
    legacy: input.legacyAdminMfaKey,
    purpose: "admin-mfa",
  });
  const aiKeys = createVersionedSecretKeys({
    keyring: input.keyring,
    legacy: input.legacyAiCredentialsKey,
    purpose: "ai-credentials",
  });
  await drainBatches(() => migrateAdminMfaBatch({
    batchSize,
    currentKey: adminKeys.current,
    keys: adminKeys,
  }));
  await drainBatches(() => migrateProviderBatch({
    batchSize,
    currentKey: aiKeys.current,
    keys: aiKeys,
  }));
  await drainBatches(() => migrateRunBatch({
    batchSize,
    currentKey: aiKeys.current,
    keys: aiKeys,
  }));
  await drainBatches(() => migrateAuditBatch({
    batchSize,
    currentKey: aiKeys.current,
    keys: aiKeys,
  }));
  return { applied: true, counts };
}
