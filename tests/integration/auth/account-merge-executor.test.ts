import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import {
  accountLifecycle,
  accountMergeLocks,
  accountMergeNotificationOutbox,
  accountMergeOperations,
  accountSocialLinkAttempts,
  db,
  pdfExportJobs,
  resumes,
} from "@/db";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import {
  advanceAccountMergeOperation,
  assertAccountMergeMutationAllowed,
  deliverAccountMergeNotices,
} from "@/lib/auth/account/merge/executor";
import { AccountMergeError } from "@/lib/auth/account/merge/errors";
import { prepareAiRun } from "@/lib/ai/runs/service";
import { enqueuePdfExport } from "@/lib/pdf/export-queue";
import { changeAccountEmail, changeAccountPassword } from "@/lib/auth/account/security";
import { submitAccountDeletion } from "@/lib/auth/account/deletion";
import { getDatabasePool } from "@/lib/runtime/database";

async function createUser(label: string) {
  const id = `merge-executor-${label}-${randomUUID()}`;
  const email = `${id}@example.com`;
  await getDatabasePool().query(
    `INSERT INTO "user"
      (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, now(), now())`,
    [id, label, email],
  );
  await getDatabasePool().query(
    `INSERT INTO "account"
      (id, "accountId", "providerId", "userId", password,
       "createdAt", "updatedAt", issuer)
     VALUES ($1, $2, 'credential', $2, $3, now(), now(), 'credential')`,
    [randomUUID(), id, await hashPassword("executor-password-123")],
  );
  return { id, email };
}

async function createFixture() {
  const primary = await createUser("primary");
  const secondary = await createUser("secondary");
  const now = new Date();
  const githubAccountId = `github-${randomUUID()}`;
  await getDatabasePool().query(
    `INSERT INTO "account"
      (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", issuer)
     VALUES ($1, $2, 'github', $3, now(), now(), 'github')`,
    [randomUUID(), githubAccountId, secondary.id],
  );
  const resumeId = `resume-${randomUUID()}`;
  const document = createEditorOnboardingDocument("zh-CN");
  await db.insert(resumes).values({
    id: resumeId,
    userId: secondary.id,
    name: "Waiting resume",
    summary: "",
    document,
  });
  const [job] = await db.insert(pdfExportJobs).values({
    resumeUserId: secondary.id,
    resumeId,
    requesterUserId: secondary.id,
    accessTokenHash: "token",
    document,
    filename: "waiting.pdf",
  }).returning({ id: pdfExportJobs.id });
  const [attempt] = await db.insert(accountSocialLinkAttempts).values({
    initiatingUserId: primary.id,
    sessionBindingHash: `binding-${randomUUID()}`,
    tokenHash: `attempt-${randomUUID()}`,
    providerId: "github",
    providerAccountId: githubAccountId,
    state: "consumed",
    expiresAt: new Date(now.getTime() + 60_000),
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
    waitDeadline: new Date(now.getTime() + 10 * 60_000),
    statusTokenHash: `status-${randomUUID()}`,
    locale: "zh-CN",
  }).returning({ id: accountMergeOperations.id });
  await db.insert(accountMergeLocks).values([
    {
      userId: primary.id,
      operationId: operation!.id,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    },
    {
      userId: secondary.id,
      operationId: operation!.id,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    },
  ]);
  return {
    document,
    jobId: job!.id,
    now,
    operationId: operation!.id,
    primary,
    resumeId,
    secondary,
  };
}

describe("account merge executor", () => {
  const fixtures: Awaited<ReturnType<typeof createFixture>>[] = [];

  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
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
      await db.delete(accountLifecycle).where(eq(
        accountLifecycle.userId,
        fixture.secondary.id,
      ));
      await db.delete(resumes).where(eq(resumes.userId, fixture.primary.id));
      await db.delete(resumes).where(eq(resumes.userId, fixture.secondary.id));
      const ids = [fixture.primary.id, fixture.secondary.id];
      await getDatabasePool().query(
        `DELETE FROM "account" WHERE "userId" = ANY($1::text[])`,
        [ids],
      );
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
        ids,
      ]);
    }
  });

  it("waits for active work, blocks mutations, then completes automatically", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);

    await expect(advanceAccountMergeOperation({
      operationId: fixture.operationId,
      now: fixture.now,
    })).resolves.toEqual({ state: "waiting" });
    await expect(assertAccountMergeMutationAllowed(fixture.primary.id))
      .rejects.toBeInstanceOf(AccountMergeError);
    await expect(assertAccountMergeMutationAllowed(fixture.secondary.id))
      .rejects.toBeInstanceOf(AccountMergeError);
    await expect(enqueuePdfExport({
      resumeUserId: fixture.secondary.id,
      resumeId: fixture.resumeId,
      requesterUserId: null,
      document: fixture.document,
      filename: "blocked-public.pdf",
    }, {
      allowAnonymous: true,
      forceExpiryMs: 60_000,
      leaseMs: 60_000,
      maxActivePerUser: 5,
      maxAttempts: 3,
      maxConcurrency: 2,
      queueLimit: 10,
      resultTtlMs: 60_000,
    })).rejects.toMatchObject({ code: "merge_in_progress" });
    await expect(enqueuePdfExport({
      resumeUserId: fixture.secondary.id,
      resumeId: fixture.resumeId,
      requesterUserId: fixture.primary.id,
      document: fixture.document,
      filename: "blocked.pdf",
    }, {
      allowAnonymous: false,
      forceExpiryMs: 60_000,
      leaseMs: 60_000,
      maxActivePerUser: 5,
      maxAttempts: 3,
      maxConcurrency: 2,
      queueLimit: 10,
      resultTtlMs: 60_000,
    })).rejects.toMatchObject({ code: "merge_in_progress" });
    await expect(prepareAiRun({
      userId: fixture.primary.id,
      conversationId: randomUUID(),
      message: "blocked",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: Buffer.alloc(32),
        auditRetentionDays: 7,
        defaultMonthlyPoints: 100,
        requestsPerMinute: 10,
        streamCheckpointMs: 1_000,
        runLeaseSeconds: 60,
      },
    })).rejects.toMatchObject({ code: "merge_in_progress" });
    await expect(changeAccountPassword({
      userId: fixture.primary.id,
      currentSessionToken: "unused",
      currentPassword: "unused",
      newPassword: "replacement-password-123",
      notify: async () => undefined,
    })).rejects.toMatchObject({
      code: "merge_in_progress",
    });
    await expect(changeAccountEmail({
      userId: fixture.primary.id,
      currentSessionToken: "unused",
      currentPassword: "unused",
      newEmail: "new@example.com",
      oldEmailCode: "123456",
      newEmailCode: "654321",
      notifyOldAddress: async () => undefined,
    })).rejects.toMatchObject({
      code: "merge_in_progress",
    });
    await expect(submitAccountDeletion({
      userId: fixture.primary.id,
      currentSessionToken: "unused",
      password: "unused",
      code: "123456",
      notify: async () => undefined,
    })).rejects.toMatchObject({
      code: "merge_in_progress",
    });

    await db.update(pdfExportJobs).set({
      status: "completed",
      completedAt: new Date(fixture.now.getTime() + 1_000),
    }).where(eq(pdfExportJobs.id, fixture.jobId));
    await expect(advanceAccountMergeOperation({
      operationId: fixture.operationId,
      now: new Date(fixture.now.getTime() + 1_000),
    })).resolves.toEqual({ state: "completed" });
    await expect(assertAccountMergeMutationAllowed(fixture.primary.id))
      .resolves.toBeUndefined();

    const delivered: string[] = [];
    await expect(deliverAccountMergeNotices({
      now: new Date(fixture.now.getTime() + 2_000),
      deliver: async (notice) => {
        delivered.push(notice.event);
      },
    })).resolves.toMatchObject({ delivered: 2, failed: 0 });
    expect(delivered).toEqual(expect.arrayContaining([
      "merge_completed_primary",
      "merge_completed_secondary",
    ]));
    await expect(db.select({
      state: accountMergeNotificationOutbox.state,
      recipientEmail: accountMergeNotificationOutbox.recipientEmail,
    }).from(accountMergeNotificationOutbox).where(eq(
      accountMergeNotificationOutbox.operationId,
      fixture.operationId,
    ))).resolves.toEqual(expect.arrayContaining([
      { state: "delivered", recipientEmail: null },
      { state: "delivered", recipientEmail: null },
    ]));
  });

  it("expires waiting merges at the deadline and releases both accounts", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const deadline = new Date(fixture.now.getTime() + 10 * 60_000);

    await expect(advanceAccountMergeOperation({
      operationId: fixture.operationId,
      now: deadline,
    })).resolves.toEqual({ state: "expired" });
    await expect(db.select({
      state: accountMergeOperations.state,
      failureCode: accountMergeOperations.failureCode,
    }).from(accountMergeOperations).where(eq(
      accountMergeOperations.id,
      fixture.operationId,
    ))).resolves.toEqual([{
      state: "expired",
      failureCode: "active_work_timeout",
    }]);
    await expect(db.select().from(accountMergeLocks).where(eq(
      accountMergeLocks.operationId,
      fixture.operationId,
    ))).resolves.toHaveLength(0);
    await expect(db.select().from(accountMergeNotificationOutbox).where(eq(
      accountMergeNotificationOutbox.operationId,
      fixture.operationId,
    ))).resolves.toHaveLength(2);
  });
});
