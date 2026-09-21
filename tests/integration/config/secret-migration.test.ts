import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { TOTP } from "otpauth";

import {
  adminMfaDevices,
  aiAuditPayloads,
  aiConversations,
  aiMessages,
  aiModels,
  aiProviderCredentials,
  aiRuns,
  db,
  resumes,
  workerHeartbeats,
} from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  decryptAdminMfaSecret,
  encryptAdminMfaSecret,
} from "@/lib/admin/crypto";
import { verifyAdminMfaCode } from "@/lib/admin/store";
import { decryptAiAuditEvidence } from "@/lib/ai/audit/store";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { encryptPreparedAiRunPayload } from "@/lib/ai/runs/run-payload";
import type { PreparedAiRun } from "@/lib/ai/runs/service";
import {
  decryptAiCredential,
  encryptAiCredential,
} from "@/lib/ai/security/credentials";
import { listPersonalAiProviders } from "@/lib/ai/settings/service";
import { createConfigKeyring } from "@/lib/config/crypto";
import {
  migrateLegacySecrets,
  SecretMigrationWorkerActiveError,
} from "@/lib/config/secret-migration";
import { getDatabasePool } from "@/lib/runtime/database";

describe("legacy secret re-encryption", () => {
  const legacyAdminKey = randomBytes(32);
  const legacyAiKey = randomBytes(32);
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  const adminCurrentKey = keyring.keyFor("admin-mfa");
  const aiCurrentKey = keyring.keyFor("ai-credentials");
  const marker = randomUUID();
  const userId = `secret-migration-${marker}`;
  const resumeId = `resume-${marker}`;
  let adminDeviceId = "";
  let providerId = "";
  let runId = "";
  const workerId = `secret-migration-worker-${marker}`;
  const originalLegacyAdminKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.ADMIN_MFA_ENCRYPTION_KEY = legacyAdminKey.toString("base64");
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, "Secret migration user", `${marker}@example.com`],
    );
    const adminSecretValue = "JBSWY3DPEHPK3PXP";
    const adminSecret = encryptAdminMfaSecret(adminSecretValue, legacyAdminKey);
    const [device] = await db.insert(adminMfaDevices).values({
      userId,
      name: "Legacy authenticator",
      ...adminSecret,
      keyVersion: 1,
      verifiedAt: new Date(),
    }).returning({ id: adminMfaDevices.id });
    adminDeviceId = device!.id;

    const [provider] = await db.insert(aiProviderCredentials).values({
      ownerUserId: userId,
      kind: "user",
      displayName: `Legacy provider ${marker}`,
      baseUrl: "https://models.example.com/v1",
      encryptedApiKey: encryptAiCredential("legacy-provider-key", legacyAiKey),
      encryptionKeyVersion: 1,
    }).returning({ id: aiProviderCredentials.id });
    providerId = provider!.id;
    const [model] = await db.insert(aiModels).values({
      providerId,
      providerModelKey: "legacy-model",
      displayName: "Legacy model",
      contextWindow: 8_192,
      maxOutputTokens: 1_024,
      inputPointRate: 0,
      cachedInputPointRate: 0,
      outputPointRate: 0,
    }).returning({ id: aiModels.id });
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      name: "Secret migration resume",
      summary: "",
      document: createDefaultResumeDocument("zh-CN"),
    });
    const [conversation] = await db.insert(aiConversations).values({
      userId,
      resumeId,
      title: "Migration",
      contextScope: "resume",
      modelId: model!.id,
    }).returning({ id: aiConversations.id });
    const [message] = await db.insert(aiMessages).values({
      conversationId: conversation!.id,
      role: "assistant",
      text: "",
      sequence: 1,
      completionState: "streaming",
    }).returning({ id: aiMessages.id });
    runId = randomUUID();
    const prepared: PreparedAiRun = {
      runId,
      userId,
      resumeId,
      conversationId: conversation!.id,
      assistantMessageId: message!.id,
      resumeVersion: 1,
      request: {
        endpoint: new URL("https://models.example.com/v1"),
        apiKey: "legacy-provider-key",
        model: "legacy-model",
        messages: [{ role: "user", content: "Hello" }],
        maxOutputTokens: 1_024,
      },
      auditRequest: { prompt: "Hello" },
      configuration: {
        credentialsEncryptionKey: legacyAiKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints: 0,
        requestsPerMinute: 10,
        streamCheckpointMs: 1_000,
        runLeaseSeconds: 90,
      },
      keySource: "user",
      rates: {
        inputPointsPerMillion: 0,
        cachedInputPointsPerMillion: 0,
        outputPointsPerMillion: 0,
      },
      rateCardVersion: 1,
      reservationOperationId: runId,
      reservedPoints: 0,
      proposalTargets: [],
      resumeDocument: createDefaultResumeDocument("zh-CN"),
      providerContext: {},
    };
    await db.insert(aiRuns).values({
      id: runId,
      userId,
      resumeId,
      conversationId: conversation!.id,
      assistantMessageId: message!.id,
      modelId: model!.id,
      keySource: "platform",
      status: "queued",
      resumeVersion: 1,
      contextHash: marker,
      promptVersion: 1,
      encryptedExecutionPayload: encryptPreparedAiRunPayload(
        prepared,
        legacyAiKey,
      ),
      executionPayloadKeyVersion: 1,
    });
    await db.insert(aiAuditPayloads).values({
      runId,
      encryptedRequest: encryptAiCredential(
        JSON.stringify({ prompt: "legacy-request" }),
        legacyAiKey,
      ),
      encryptedResponse: encryptAiCredential(
        JSON.stringify({ answer: "legacy-response" }),
        legacyAiKey,
      ),
      encryptionKeyVersion: 1,
      payloadHash: marker.replaceAll("-", ""),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await db.delete(resumes).where(eq(resumes.id, resumeId));
    if (providerId) {
      await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, providerId));
    }
    if (adminDeviceId) {
      await db.delete(adminMfaDevices).where(eq(adminMfaDevices.id, adminDeviceId));
    }
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerId, workerId));
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    if (originalLegacyAdminKey === undefined) {
      delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
    } else {
      process.env.ADMIN_MFA_ENCRYPTION_KEY = originalLegacyAdminKey;
    }
  });

  it("reports, blocks active workers, and idempotently migrates every legacy table", async () => {
    const input = {
      keyring,
      legacyAdminMfaKey: legacyAdminKey,
      legacyAiCredentialsKey: legacyAiKey,
      batchSize: 2,
    };
    const dryRun = await migrateLegacySecrets(input);

    const token = new TOTP({ secret: "JBSWY3DPEHPK3PXP" }).generate();
    await expect(verifyAdminMfaCode({ userId, token })).resolves.toBe(
      adminDeviceId,
    );
    await expect(listPersonalAiProviders({
      userId,
      encryptionKey: aiCurrentKey,
      credentialKeys: {
        current: aiCurrentKey,
        legacy: legacyAiKey,
      },
    })).resolves.toEqual([
      expect.objectContaining({ maskedApiKey: "••••-key" }),
    ]);
    const [claimed] = await claimQueuedAiRuns({
      workerId: workerId,
      limit: 1,
      leaseSeconds: 90,
      encryptionKey: aiCurrentKey,
      credentialKeys: {
        current: aiCurrentKey,
        legacy: legacyAiKey,
      },
    });
    expect(claimed?.request.apiKey).toBe("legacy-provider-key");
    await db.update(aiRuns).set({
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
    }).where(eq(aiRuns.id, runId));
    const [legacyAudit] = await db.select().from(aiAuditPayloads)
      .where(eq(aiAuditPayloads.runId, runId));
    expect(decryptAiAuditEvidence({
      encryptedRequest: legacyAudit!.encryptedRequest,
      encryptedResponse: legacyAudit!.encryptedResponse!,
      encryptionKeyVersion: legacyAudit!.encryptionKeyVersion,
    }, {
      current: aiCurrentKey,
      legacy: legacyAiKey,
    })).toEqual({
      request: { prompt: "legacy-request" },
      response: { answer: "legacy-response" },
    });

    expect(dryRun).toEqual({
      applied: false,
      counts: {
        adminMfaDevices: 1,
        aiProviderCredentials: 1,
        aiRuns: 1,
        aiAuditPayloads: 1,
        total: 4,
      },
    });
    expect(JSON.stringify(dryRun)).not.toContain("legacy-");

    await db.insert(workerHeartbeats).values({
      workerId,
      sessionId: workerId,
      workerType: "ai-runtime",
      release: "test",
      startedAt: new Date(),
      lastSeenAt: new Date(),
      metadata: {},
    });
    await expect(migrateLegacySecrets({ ...input, apply: true })).rejects
      .toBeInstanceOf(SecretMigrationWorkerActiveError);

    const applied = await migrateLegacySecrets({
      ...input,
      apply: true,
      workerStopped: true,
    });
    expect(applied).toEqual({ ...dryRun, applied: true });
    expect(
      await migrateLegacySecrets({
        ...input,
        apply: true,
        workerStopped: true,
      }),
    ).toEqual({
      applied: true,
      counts: {
        adminMfaDevices: 0,
        aiProviderCredentials: 0,
        aiRuns: 0,
        aiAuditPayloads: 0,
        total: 0,
      },
    });

    const [device] = await db.select().from(adminMfaDevices)
      .where(eq(adminMfaDevices.id, adminDeviceId));
    expect(device!.keyVersion).toBe(2);
    expect(decryptAdminMfaSecret(device!, adminCurrentKey)).toBe(
      "JBSWY3DPEHPK3PXP",
    );
    const [provider] = await db.select().from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.id, providerId));
    expect(provider!.encryptionKeyVersion).toBe(2);
    expect(decryptAiCredential(provider!.encryptedApiKey, aiCurrentKey)).toBe(
      "legacy-provider-key",
    );
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId));
    expect(run!.executionPayloadKeyVersion).toBe(2);
    const [reclaimed] = await claimQueuedAiRuns({
      workerId: `${workerId}-after`,
      limit: 1,
      leaseSeconds: 90,
      encryptionKey: aiCurrentKey,
      credentialKeys: { current: aiCurrentKey },
    });
    expect(reclaimed?.request.apiKey).toBe("legacy-provider-key");
    const [audit] = await db.select().from(aiAuditPayloads)
      .where(eq(aiAuditPayloads.runId, runId));
    expect(audit!.encryptionKeyVersion).toBe(2);
    expect(decryptAiCredential(audit!.encryptedRequest, aiCurrentKey)).toBe(
      JSON.stringify({ prompt: "legacy-request" }),
    );
    expect(decryptAiCredential(audit!.encryptedResponse!, aiCurrentKey)).toBe(
      JSON.stringify({ answer: "legacy-response" }),
    );
  });
});
