import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import {
  accountEmailChallenges,
  accountLifecycle,
  accountMergeLocks,
  accountMergeNotificationOutbox,
  accountMergeOperations,
  accountSocialLinkAttempts,
  aiConversations,
  aiMessages,
  aiModels,
  aiProviderCredentials,
  aiQuotaAccounts,
  aiRuns,
  aiUsageLedger,
  db,
  getDatabaseSchemaName,
  onboardingRuns,
  pdfExportJobs,
  resumes,
  resumeVersions,
  userInvitations,
} from "@/db";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import { executeAccountMergeTransfer } from "@/lib/auth/account/merge/transfer";
import { createMergedAccountEmail } from "@/lib/auth/account/merge/tokens";
import { getDatabasePool } from "@/lib/runtime/database";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

async function createUser(label: string) {
  const id = `merge-transfer-${label}-${randomUUID()}`;
  const email = `${id}@example.com`;
  const password = `${label}-password-123`;
  await getDatabasePool().query(
    `INSERT INTO "user"
      (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, now(), now())`,
    [id, `${label} name`, email],
  );
  await getDatabasePool().query(
    `INSERT INTO "account"
      (id, "accountId", "providerId", "userId", password,
       "createdAt", "updatedAt", issuer)
     VALUES ($1, $2, 'credential', $2, $3, now(), now(), 'credential')`,
    [randomUUID(), id, await hashPassword(password)],
  );
  await getDatabasePool().query(
    `INSERT INTO "session"
      (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now() + interval '1 day', now(), now())`,
    [randomUUID(), id, `session-${randomUUID()}`],
  );
  return { id, email, name: `${label} name`, password };
}

async function createFixture() {
  const primary = await createUser("primary");
  const secondary = await createUser("secondary");
  const now = new Date("2026-10-09T12:00:00.000Z");
  const document = createEditorOnboardingDocument("zh-CN");
  const primaryResumeId = `primary-resume-${randomUUID()}`;
  const secondaryResumeId = `secondary-resume-${randomUUID()}`;
  const onboardingResumeId = `onboarding-resume-${randomUUID()}`;
  const secondarySlug = `secondary-${randomUUID()}`;
  const githubAccountId = `github-${randomUUID()}`;

  await getDatabasePool().query(
    `INSERT INTO "account"
      (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", issuer)
     VALUES ($1, $2, 'github', $3, now(), now(), 'github')`,
    [randomUUID(), githubAccountId, secondary.id],
  );
  await db.insert(resumes).values([
    {
      id: primaryResumeId,
      userId: primary.id,
      name: "Primary resume",
      summary: "",
      document,
    },
    {
      id: secondaryResumeId,
      userId: secondary.id,
      name: "Secondary resume",
      summary: "",
      slug: secondarySlug,
      published: true,
      document,
    },
    {
      id: onboardingResumeId,
      userId: secondary.id,
      kind: "onboarding",
      name: "Practice",
      summary: "",
      document,
    },
  ]);
  const versionId = `version-${randomUUID()}`;
  await db.insert(resumeVersions).values({
    id: versionId,
    userId: secondary.id,
    resumeId: secondaryResumeId,
    version: 1,
    document,
  });
  const [pdf] = await db.insert(pdfExportJobs).values({
    resumeUserId: secondary.id,
    resumeId: secondaryResumeId,
    requesterUserId: secondary.id,
    accessTokenHash: "pdf-token",
    status: "completed",
    document,
    filename: "secondary.pdf",
    result: Buffer.from("pdf"),
    completedAt: now,
  }).returning({ id: pdfExportJobs.id });
  await db.insert(onboardingRuns).values({
    id: `onboarding-${randomUUID()}`,
    userId: secondary.id,
    flowKey: "editor-basics",
    flowVersion: 1,
    source: "manual",
    triggerKey: `trigger-${randomUUID()}`,
    resumeId: onboardingResumeId,
    status: "paused",
    currentStep: "welcome",
  });

  const [provider] = await db.insert(aiProviderCredentials).values({
    ownerUserId: secondary.id,
    kind: "user",
    displayName: "Secondary provider",
    baseUrl: "https://ai.example.com",
    encryptedApiKey: Buffer.from("secondary-secret"),
  }).returning({ id: aiProviderCredentials.id });
  const [model] = await db.insert(aiModels).values({
    providerId: provider!.id,
    providerModelKey: "secondary-model",
    displayName: "Secondary model",
    contextWindow: 8192,
    maxOutputTokens: 1024,
    inputPointRate: 1,
    cachedInputPointRate: 1,
    outputPointRate: 1,
  }).returning({ id: aiModels.id });
  const [conversation] = await db.insert(aiConversations).values({
    userId: secondary.id,
    resumeId: secondaryResumeId,
    title: "History",
    contextScope: "resume",
    modelId: model!.id,
  }).returning({ id: aiConversations.id });
  const [message] = await db.insert(aiMessages).values({
    conversationId: conversation!.id,
    role: "assistant",
    text: "Historical response",
    sequence: 1,
    completionState: "complete",
  }).returning({ id: aiMessages.id });
  const [run] = await db.insert(aiRuns).values({
    userId: secondary.id,
    resumeId: secondaryResumeId,
    conversationId: conversation!.id,
    assistantMessageId: message!.id,
    modelId: model!.id,
    keySource: "user",
    status: "complete",
    resumeVersion: 1,
    contextHash: "context",
    promptVersion: 1,
    finalPoints: 9,
    completedAt: now,
  }).returning({ id: aiRuns.id });
  const [ledger] = await db.insert(aiUsageLedger).values({
    userId: secondary.id,
    runId: run!.id,
    entryType: "settlement",
    pointsDelta: 9,
    modelId: model!.id,
    rateCardVersion: 1,
  }).returning({ id: aiUsageLedger.id });
  await db.insert(aiQuotaAccounts).values([
    {
      userId: primary.id,
      monthlyLimit: 100,
      periodStartedAt: now,
      periodEndsAt: new Date("2026-11-09T12:00:00.000Z"),
      usedPoints: 10,
    },
    {
      userId: secondary.id,
      monthlyLimit: 999,
      periodStartedAt: now,
      periodEndsAt: new Date("2026-11-09T12:00:00.000Z"),
      usedPoints: 200,
    },
  ]);
  await db.insert(accountEmailChallenges).values({
    userId: secondary.id,
    purpose: "change_email_old",
    emailHash: "email-hash",
    codeHash: "code-hash",
    expiresAt: new Date("2026-10-09T13:00:00.000Z"),
    resendAvailableAt: now,
  });
  const verificationId = randomUUID();
  await getDatabasePool().query(
    `INSERT INTO "verification"
      (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`,
    [verificationId, `reset-password:${randomUUID()}`, secondary.id],
  );
  const [pendingInvitation, acceptedInvitation] = await db.insert(
    userInvitations,
  ).values([
    {
      inviterUserId: secondary.id,
      invitedEmail: `pending-${randomUUID()}@example.com`,
      tokenHash: `pending-token-${randomUUID()}`,
      lastSentAt: now,
      expiresAt: new Date("2026-10-10T12:00:00.000Z"),
    },
    {
      inviterUserId: secondary.id,
      invitedEmail: `accepted-${randomUUID()}@example.com`,
      tokenHash: null,
      lastSentAt: now,
      expiresAt: new Date("2026-10-10T12:00:00.000Z"),
      acceptedByUserId: primary.id,
      acceptedAt: now,
    },
  ]).returning({ id: userInvitations.id });
  await getDatabasePool().query(
    `INSERT INTO ${table("admin_audit_events")}
      (actor_user_id, action, target_type, target_id, outcome, metadata)
     VALUES ($1, 'test.merge.history', 'user', $1, 'success', '{}'::jsonb)`,
    [secondary.id],
  );

  const [attempt] = await db.insert(accountSocialLinkAttempts).values({
    initiatingUserId: primary.id,
    sessionBindingHash: `session-binding-${randomUUID()}`,
    tokenHash: `attempt-token-${randomUUID()}`,
    providerId: "github",
    providerAccountId: githubAccountId,
    state: "consumed",
    expiresAt: new Date("2026-10-09T13:00:00.000Z"),
    consumedAt: now,
  }).returning({ id: accountSocialLinkAttempts.id });
  const [operation] = await db.insert(accountMergeOperations).values({
    linkAttemptId: attempt!.id,
    initiatingUserId: primary.id,
    targetUserId: secondary.id,
    primaryUserId: primary.id,
    secondaryUserId: secondary.id,
    providerId: "github",
    providerAccountId: githubAccountId,
    state: "confirmed",
    confirmNotBefore: now,
    confirmedAt: now,
    waitDeadline: new Date("2026-10-09T12:10:00.000Z"),
    statusTokenHash: `status-${randomUUID()}`,
    locale: "zh-CN",
    sourceEmailMasked: "m***@example.com",
    sourceEmailDigest: `digest-${randomUUID()}`,
  }).returning({ id: accountMergeOperations.id });
  await db.insert(accountMergeLocks).values([
    {
      userId: primary.id,
      operationId: operation!.id,
      expiresAt: new Date("2026-10-09T12:10:00.000Z"),
    },
    {
      userId: secondary.id,
      operationId: operation!.id,
      expiresAt: new Date("2026-10-09T12:10:00.000Z"),
    },
  ]);

  return {
    acceptedInvitationId: acceptedInvitation!.id,
    conversationId: conversation!.id,
    githubAccountId,
    ledgerId: ledger!.id,
    modelId: model!.id,
    now,
    onboardingResumeId,
    operationId: operation!.id,
    pdfId: pdf!.id,
    pendingInvitationId: pendingInvitation!.id,
    primary,
    primaryResumeId,
    providerId: provider!.id,
    runId: run!.id,
    secondary,
    secondaryResumeId,
    secondarySlug,
    versionId,
    verificationId,
  };
}

async function cleanupFixture(fixture: Fixture | undefined) {
  if (!fixture) return;
  await db.delete(accountMergeNotificationOutbox).where(eq(
    accountMergeNotificationOutbox.operationId,
    fixture.operationId,
  ));
  await db.delete(accountMergeLocks).where(eq(
    accountMergeLocks.operationId,
    fixture.operationId,
  ));
  await db.delete(accountMergeOperations).where(eq(
    accountMergeOperations.id,
    fixture.operationId,
  ));
  await db.delete(accountSocialLinkAttempts).where(eq(
    accountSocialLinkAttempts.initiatingUserId,
    fixture.primary.id,
  ));
  await getDatabasePool().query(
    `DELETE FROM ${table("admin_audit_events")} WHERE action = 'test.merge.history'
      AND actor_user_id = ANY($1::text[])`,
    [[fixture.primary.id, fixture.secondary.id]],
  );
  await db.delete(userInvitations).where(eq(
    userInvitations.inviterUserId,
    fixture.secondary.id,
  ));
  await db.delete(accountEmailChallenges).where(eq(
    accountEmailChallenges.userId,
    fixture.secondary.id,
  ));
  await db.delete(onboardingRuns).where(eq(onboardingRuns.userId, fixture.secondary.id));
  await db.delete(aiUsageLedger).where(eq(aiUsageLedger.id, fixture.ledgerId));
  await db.delete(aiRuns).where(eq(aiRuns.id, fixture.runId));
  await db.delete(aiConversations).where(eq(aiConversations.id, fixture.conversationId));
  await db.delete(aiQuotaAccounts).where(and(
    eq(aiQuotaAccounts.userId, fixture.primary.id),
  ));
  await db.delete(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, fixture.secondary.id));
  await db.delete(aiModels).where(eq(aiModels.id, fixture.modelId));
  await db.delete(aiProviderCredentials).where(eq(
    aiProviderCredentials.id,
    fixture.providerId,
  ));
  await db.delete(resumes).where(eq(resumes.userId, fixture.primary.id));
  await db.delete(resumes).where(eq(resumes.userId, fixture.secondary.id));
  await db.delete(accountLifecycle).where(eq(accountLifecycle.userId, fixture.secondary.id));
  const userIds = [fixture.primary.id, fixture.secondary.id];
  await getDatabasePool().query(`DELETE FROM "verification" WHERE id = $1`, [
    fixture.verificationId,
  ]);
  await getDatabasePool().query(
    `DELETE FROM "session" WHERE "userId" = ANY($1::text[])`,
    [userIds],
  );
  await getDatabasePool().query(
    `DELETE FROM "account" WHERE "userId" = ANY($1::text[])`,
    [userIds],
  );
  await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
    userIds,
  ]);
}

describe("account merge transfer", () => {
  let fixture: Fixture | undefined;

  afterEach(async () => {
    await cleanupFixture(fixture);
    fixture = undefined;
  });

  it("moves durable ownership while retaining only the primary identity and settings", async () => {
    fixture = await createFixture();
    const originalCiphertext = Buffer.from("secondary-secret");
    const initialGitHubOwner = await getDatabasePool().query<{
      userId: string;
    }>(
      `SELECT "userId" AS "userId" FROM "account"
        WHERE "providerId" = 'github' AND "accountId" = $1`,
      [fixture.githubAccountId],
    );
    expect(initialGitHubOwner.rows).toEqual([{ userId: fixture.secondary.id }]);

    await expect(executeAccountMergeTransfer({
      operationId: fixture.operationId,
      now: fixture.now,
    })).resolves.toEqual({ state: "completed" });

    const identity = await getDatabasePool().query<{
      id: string;
      email: string;
      name: string;
      emailVerified: boolean;
    }>(
      `SELECT id, email, name, "emailVerified" AS "emailVerified"
         FROM "user" WHERE id = ANY($1::text[]) ORDER BY id`,
      [[fixture.primary.id, fixture.secondary.id]],
    );
    expect(identity.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: fixture.primary.id,
        email: fixture.primary.email,
        name: fixture.primary.name,
        emailVerified: true,
      }),
      expect.objectContaining({
        id: fixture.secondary.id,
        email: createMergedAccountEmail(fixture.secondary.id),
        emailVerified: false,
      }),
    ]));
    const accounts = await getDatabasePool().query<{
      userId: string;
      providerId: string;
      accountId: string;
    }>(
      `SELECT "userId" AS "userId", "providerId" AS "providerId",
              "accountId" AS "accountId"
         FROM "account" WHERE "userId" = ANY($1::text[])
         ORDER BY "providerId"`,
      [[fixture.primary.id, fixture.secondary.id]],
    );
    expect(accounts.rows).toEqual([
      expect.objectContaining({
        userId: fixture.primary.id,
        providerId: "credential",
      }),
      {
        userId: fixture.primary.id,
        providerId: "github",
        accountId: fixture.githubAccountId,
      },
    ]);

    await expect(db.select({
      id: resumes.id,
      userId: resumes.userId,
      slug: resumes.slug,
    }).from(resumes).where(eq(resumes.id, fixture.secondaryResumeId)))
      .resolves.toEqual([{
        id: fixture.secondaryResumeId,
        userId: fixture.primary.id,
        slug: fixture.secondarySlug,
      }]);
    await expect(db.select().from(resumes).where(eq(
      resumes.id,
      fixture.onboardingResumeId,
    ))).resolves.toHaveLength(0);
    await expect(db.select({ userId: resumeVersions.userId }).from(
      resumeVersions,
    ).where(eq(resumeVersions.id, fixture.versionId))).resolves.toEqual([
      { userId: fixture.primary.id },
    ]);
    await expect(db.select({
      resumeUserId: pdfExportJobs.resumeUserId,
      requesterUserId: pdfExportJobs.requesterUserId,
    }).from(pdfExportJobs).where(eq(pdfExportJobs.id, fixture.pdfId)))
      .resolves.toEqual([{
        resumeUserId: fixture.primary.id,
        requesterUserId: fixture.primary.id,
      }]);
    await expect(db.select({ userId: aiConversations.userId }).from(
      aiConversations,
    ).where(eq(aiConversations.id, fixture.conversationId))).resolves.toEqual([
      { userId: fixture.primary.id },
    ]);
    await expect(db.select({ userId: aiRuns.userId }).from(aiRuns).where(eq(
      aiRuns.id,
      fixture.runId,
    ))).resolves.toEqual([{ userId: fixture.primary.id }]);
    await expect(db.select({ userId: aiUsageLedger.userId }).from(
      aiUsageLedger,
    ).where(eq(aiUsageLedger.id, fixture.ledgerId))).resolves.toEqual([
      { userId: fixture.primary.id },
    ]);
    await expect(db.select({
      userId: aiQuotaAccounts.userId,
      monthlyLimit: aiQuotaAccounts.monthlyLimit,
      usedPoints: aiQuotaAccounts.usedPoints,
    }).from(aiQuotaAccounts).where(eq(
      aiQuotaAccounts.userId,
      fixture.primary.id,
    ))).resolves.toEqual([{
      userId: fixture.primary.id,
      monthlyLimit: 100,
      usedPoints: 10,
    }]);
    await expect(db.select().from(aiQuotaAccounts).where(eq(
      aiQuotaAccounts.userId,
      fixture.secondary.id,
    ))).resolves.toHaveLength(0);

    const [credential] = await db.select({
      encryptedApiKey: aiProviderCredentials.encryptedApiKey,
      enabled: aiProviderCredentials.enabled,
      deletedAt: aiProviderCredentials.deletedAt,
    }).from(aiProviderCredentials).where(eq(
      aiProviderCredentials.id,
      fixture.providerId,
    ));
    expect(credential).toMatchObject({ enabled: false });
    expect(credential!.deletedAt).toEqual(fixture.now);
    expect(credential!.encryptedApiKey.equals(originalCiphertext)).toBe(false);
    await expect(db.select({
      enabled: aiModels.enabled,
      deletedAt: aiModels.deletedAt,
    }).from(aiModels).where(eq(aiModels.id, fixture.modelId))).resolves.toEqual([
      { enabled: false, deletedAt: fixture.now },
    ]);

    await expect(db.select().from(onboardingRuns).where(eq(
      onboardingRuns.userId,
      fixture.secondary.id,
    ))).resolves.toHaveLength(0);
    await expect(db.select().from(accountEmailChallenges).where(eq(
      accountEmailChallenges.userId,
      fixture.secondary.id,
    ))).resolves.toHaveLength(0);
    const invitations = await db.select({
      id: userInvitations.id,
      inviterUserId: userInvitations.inviterUserId,
      invalidationReason: userInvitations.invalidationReason,
      tokenHash: userInvitations.tokenHash,
    }).from(userInvitations).where(eq(
      userInvitations.inviterUserId,
      fixture.secondary.id,
    ));
    expect(invitations).toEqual(expect.arrayContaining([
      {
        id: fixture.pendingInvitationId,
        inviterUserId: fixture.secondary.id,
        invalidationReason: "inviter_account_merged",
        tokenHash: null,
      },
      expect.objectContaining({
        id: fixture.acceptedInvitationId,
        inviterUserId: fixture.secondary.id,
        invalidationReason: null,
      }),
    ]));
    const sessions = await getDatabasePool().query(
      `SELECT id FROM "session" WHERE "userId" = ANY($1::text[])`,
      [[fixture.primary.id, fixture.secondary.id]],
    );
    expect(sessions.rows).toHaveLength(0);
    const verifications = await getDatabasePool().query(
      `SELECT id FROM "verification" WHERE id = $1`,
      [fixture.verificationId],
    );
    expect(verifications.rows).toHaveLength(0);
    await expect(db.select().from(accountLifecycle).where(eq(
      accountLifecycle.userId,
      fixture.secondary.id,
    ))).resolves.toEqual([
      expect.objectContaining({
        status: "merged",
        mergedIntoUserId: fixture.primary.id,
        mergedAt: fixture.now,
      }),
    ]);
    await expect(db.select({
      state: accountMergeOperations.state,
    }).from(accountMergeOperations).where(eq(
      accountMergeOperations.id,
      fixture.operationId,
    ))).resolves.toEqual([{ state: "completed" }]);
    await expect(db.select().from(accountMergeLocks).where(eq(
      accountMergeLocks.operationId,
      fixture.operationId,
    ))).resolves.toHaveLength(0);
    await expect(db.select({
      event: accountMergeNotificationOutbox.event,
      recipientEmail: accountMergeNotificationOutbox.recipientEmail,
    }).from(accountMergeNotificationOutbox).where(eq(
      accountMergeNotificationOutbox.operationId,
      fixture.operationId,
    ))).resolves.toEqual(expect.arrayContaining([
      {
        event: "merge_completed_primary",
        recipientEmail: fixture.primary.email,
      },
      {
        event: "merge_completed_secondary",
        recipientEmail: fixture.secondary.email,
      },
    ]));
    const audit = await getDatabasePool().query<{ actorUserId: string }>(
      `SELECT actor_user_id AS "actorUserId"
         FROM ${table("admin_audit_events")}
        WHERE action = 'test.merge.history' AND actor_user_id = $1`,
      [fixture.secondary.id],
    );
    expect(audit.rows).toEqual([{ actorUserId: fixture.secondary.id }]);

    await expect(executeAccountMergeTransfer({
      operationId: fixture.operationId,
      now: new Date("2026-10-09T12:01:00.000Z"),
    })).resolves.toEqual({ state: "completed" });
    await expect(db.select().from(accountMergeNotificationOutbox).where(eq(
      accountMergeNotificationOutbox.operationId,
      fixture.operationId,
    ))).resolves.toHaveLength(2);
  });

  it("rolls every mutation back when a late lifecycle write fails", async () => {
    fixture = await createFixture();
    const functionName = `reject_merge_${randomUUID().replaceAll("-", "_")}`;
    const triggerName = `reject_merge_${randomUUID().replaceAll("-", "_")}`;
    await getDatabasePool().query(
      `CREATE FUNCTION ${table(functionName)}() RETURNS trigger AS $$
       BEGIN
         IF NEW.status = 'merged' THEN
           RAISE EXCEPTION 'forced account merge failure';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;
       CREATE TRIGGER ${quoteIdentifier(triggerName)}
       BEFORE INSERT OR UPDATE ON ${table("account_lifecycle")}
       FOR EACH ROW EXECUTE FUNCTION ${table(functionName)}()`,
    );
    try {
      await expect(executeAccountMergeTransfer({
        operationId: fixture.operationId,
        now: fixture.now,
      })).rejects.toThrow("forced account merge failure");
    } finally {
      await getDatabasePool().query(
        `DROP TRIGGER IF EXISTS ${quoteIdentifier(triggerName)}
           ON ${table("account_lifecycle")};
         DROP FUNCTION IF EXISTS ${table(functionName)}()`,
      );
    }

    await expect(db.select({ userId: resumes.userId }).from(resumes).where(eq(
      resumes.id,
      fixture.secondaryResumeId,
    ))).resolves.toEqual([{ userId: fixture.secondary.id }]);
    const github = await getDatabasePool().query<{ userId: string }>(
      `SELECT "userId" AS "userId" FROM "account"
        WHERE "providerId" = 'github' AND "accountId" = $1`,
      [fixture.githubAccountId],
    );
    expect(github.rows).toEqual([{ userId: fixture.secondary.id }]);
    await expect(db.select({ state: accountMergeOperations.state }).from(
      accountMergeOperations,
    ).where(eq(accountMergeOperations.id, fixture.operationId)))
      .resolves.toEqual([{ state: "confirmed" }]);
    await expect(db.select().from(accountMergeNotificationOutbox).where(eq(
      accountMergeNotificationOutbox.operationId,
      fixture.operationId,
    ))).resolves.toHaveLength(0);
  });

  it("rolls ownership changes back if the authorizing provider disappears", async () => {
    fixture = await createFixture();
    await getDatabasePool().query(
      `DELETE FROM "account" WHERE "providerId" = 'github' AND "accountId" = $1`,
      [fixture.githubAccountId],
    );

    await expect(executeAccountMergeTransfer({
      operationId: fixture.operationId,
      now: fixture.now,
    })).rejects.toMatchObject({ code: "provider_ownership_changed" });
    await expect(db.select({ userId: resumes.userId }).from(resumes).where(eq(
      resumes.id,
      fixture.secondaryResumeId,
    ))).resolves.toEqual([{ userId: fixture.secondary.id }]);
    await expect(db.select({ enabled: aiProviderCredentials.enabled }).from(
      aiProviderCredentials,
    ).where(eq(aiProviderCredentials.id, fixture.providerId)))
      .resolves.toEqual([{ enabled: true }]);
    await expect(db.select({ state: accountMergeOperations.state }).from(
      accountMergeOperations,
    ).where(eq(accountMergeOperations.id, fixture.operationId)))
      .resolves.toEqual([{ state: "confirmed" }]);
  });
});
