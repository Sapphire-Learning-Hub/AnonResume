import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import {
  accountEmailChallenges,
  accountLifecycle,
  adminPrincipals,
  aiProviderCredentials,
  db,
  pdfExportJobs,
  resumes,
} from "@/db";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import { issueAccountEmailChallenge } from "@/lib/auth/account/challenges";
import {
  restoreAccountDeletion,
  submitAccountDeletion,
} from "@/lib/auth/account/deletion";
import { runAccountMaintenance } from "@/lib/auth/account/maintenance";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account deletion lifecycle", () => {
  const userIds: string[] = [];

  async function createUser(label: string) {
    const userId = `deletion-${label}-${randomUUID()}`;
    const email = `${userId}@example.com`;
    const password = "current-password-123";
    userIds.push(userId);
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, `User ${label}`, email],
    );
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, now(), now(), 'credential')`,
      [randomUUID(), userId, await hashPassword(password)],
    );
    return { userId, email, password };
  }

  async function addSession(userId: string, token: string) {
    const id = randomUUID();
    await getDatabasePool().query(
      `INSERT INTO "session"
        (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() + interval '30 days', now(), now())`,
      [id, userId, token],
    );
    return id;
  }

  async function issueCode(input: {
    userId: string;
    email: string;
    purpose: "delete_account" | "restore_account";
    now: Date;
  }) {
    let code = "";
    await issueAccountEmailChallenge({
      ...input,
      source: "127.0.0.1",
      deliver: async (value) => {
        code = value.code;
      },
    });
    return code;
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db
        .delete(accountEmailChallenges)
        .where(eq(accountEmailChallenges.userId, userId));
      await db
        .delete(accountLifecycle)
        .where(eq(accountLifecycle.userId, userId));
      await db
        .delete(aiProviderCredentials)
        .where(eq(aiProviderCredentials.ownerUserId, userId));
      await db.delete(adminPrincipals).where(eq(adminPrincipals.userId, userId));
      await db.delete(resumes).where(eq(resumes.userId, userId));
      await getDatabasePool().query(
        `DELETE FROM "session" WHERE "userId" = $1`,
        [userId],
      );
      await getDatabasePool().query(
        `DELETE FROM "account" WHERE "userId" = $1`,
        [userId],
      );
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [
        userId,
      ]);
    }
  });

  it("immediately unpublishes resumes, cancels work, and keeps only the current session", async () => {
    const user = await createUser("submit");
    await addSession(user.userId, "current-session");
    await addSession(user.userId, "other-session");
    const resumeId = `resume-${randomUUID()}`;
    const document = createEditorOnboardingDocument("zh-CN");
    await db.insert(resumes).values({
      id: resumeId,
      userId: user.userId,
      name: "Published",
      summary: "",
      slug: `published-${randomUUID()}`,
      published: true,
      document,
    });
    const [job] = await db
      .insert(pdfExportJobs)
      .values({
        resumeUserId: user.userId,
        resumeId,
        requesterUserId: user.userId,
        accessTokenHash: "hash",
        document,
        filename: "resume.pdf",
      })
      .returning({ id: pdfExportJobs.id });
    const now = new Date("2026-10-07T00:00:00.000Z");
    const code = await issueCode({
      userId: user.userId,
      email: user.email,
      purpose: "delete_account",
      now,
    });

    const result = await submitAccountDeletion({
      userId: user.userId,
      currentSessionToken: "current-session",
      password: user.password,
      code,
      now,
      notify: async () => undefined,
    });

    expect(result.deletionDueAt).toEqual(
      new Date("2026-10-14T00:00:00.000Z"),
    );
    await expect(
      db
        .select({ published: resumes.published, slug: resumes.slug })
        .from(resumes)
        .where(eq(resumes.id, resumeId)),
    ).resolves.toEqual([{ published: false, slug: null }]);
    await expect(
      db
        .select({ status: pdfExportJobs.status })
        .from(pdfExportJobs)
        .where(eq(pdfExportJobs.id, job!.id)),
    ).resolves.toEqual([{ status: "cancelled" }]);
    const sessions = await getDatabasePool().query<{ token: string }>(
      `SELECT token FROM "session" WHERE "userId" = $1`,
      [user.userId],
    );
    expect(sessions.rows).toEqual([{ token: "current-session" }]);
  });

  it("restores during the cooling period without republishing content", async () => {
    const user = await createUser("restore");
    await addSession(user.userId, "current-session");
    const resumeId = `resume-${randomUUID()}`;
    await db.insert(resumes).values({
      id: resumeId,
      userId: user.userId,
      name: "Draft after recovery",
      summary: "",
      slug: `published-${randomUUID()}`,
      published: true,
      document: createEditorOnboardingDocument("zh-CN"),
    });
    const requestedAt = new Date("2026-10-07T00:00:00.000Z");
    await submitAccountDeletion({
      userId: user.userId,
      currentSessionToken: "current-session",
      password: user.password,
      code: await issueCode({
        userId: user.userId,
        email: user.email,
        purpose: "delete_account",
        now: requestedAt,
      }),
      now: requestedAt,
      notify: async () => undefined,
    });
    const recoveryTime = new Date("2026-10-13T23:59:59.999Z");
    const recoveryCode = await issueCode({
      userId: user.userId,
      email: user.email,
      purpose: "restore_account",
      now: recoveryTime,
    });

    await restoreAccountDeletion({
      userId: user.userId,
      currentSessionToken: "current-session",
      password: user.password,
      code: recoveryCode,
      now: recoveryTime,
      notify: async () => undefined,
    });

    await expect(getAccountLifecycle(user.userId)).resolves.toMatchObject({
      status: "active",
    });
    await expect(
      db
        .select({ published: resumes.published, slug: resumes.slug })
        .from(resumes)
        .where(eq(resumes.id, resumeId)),
    ).resolves.toEqual([{ published: false, slug: null }]);
  });

  it("anonymizes due accounts, clears delegated access, and releases the email", async () => {
    const user = await createUser("maintenance");
    await addSession(user.userId, "current-session");
    await db.insert(adminPrincipals).values({
      userId: user.userId,
      kind: "delegated_admin",
    });
    await db.insert(aiProviderCredentials).values({
      ownerUserId: user.userId,
      kind: "user",
      displayName: "Private provider",
      baseUrl: "https://ai.example.com",
      encryptedApiKey: Buffer.from("private-key-ciphertext"),
      encryptionKeyVersion: 1,
    });
    await db.insert(resumes).values({
      id: `resume-${randomUUID()}`,
      userId: user.userId,
      name: "Delete me",
      summary: "",
      document: createEditorOnboardingDocument("zh-CN"),
    });
    const requestedAt = new Date("2026-10-07T00:00:00.000Z");
    await submitAccountDeletion({
      userId: user.userId,
      currentSessionToken: "current-session",
      password: user.password,
      code: await issueCode({
        userId: user.userId,
        email: user.email,
        purpose: "delete_account",
        now: requestedAt,
      }),
      now: requestedAt,
      notify: async () => undefined,
    });

    const first = await runAccountMaintenance({
      now: new Date("2026-10-14T00:00:00.000Z"),
      limit: 10,
      notifyDeleted: async () => undefined,
    });
    const second = await runAccountMaintenance({
      now: new Date("2026-10-14T00:00:01.000Z"),
      limit: 10,
      notifyDeleted: async () => undefined,
    });

    expect(first).toMatchObject({ processed: 1, deleted: 1, failed: 0 });
    expect(second).toMatchObject({ processed: 0, deleted: 0, failed: 0 });
    await expect(getAccountLifecycle(user.userId)).resolves.toMatchObject({
      status: "deleted",
      deletedAt: new Date("2026-10-14T00:00:00.000Z"),
    });
    const identity = await getDatabasePool().query<{
      name: string;
      email: string;
      emailVerified: boolean;
    }>(
      `SELECT name, email, "emailVerified" AS "emailVerified"
         FROM "user" WHERE id = $1`,
      [user.userId],
    );
    expect(identity.rows[0]).toEqual({
      name: "Deleted user",
      email: `deleted+${user.userId}@deleted.invalid`,
      emailVerified: false,
    });
    await expect(
      db.select().from(resumes).where(eq(resumes.userId, user.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(aiProviderCredentials)
        .where(eq(aiProviderCredentials.ownerUserId, user.userId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(adminPrincipals)
        .where(eq(adminPrincipals.userId, user.userId)),
    ).resolves.toHaveLength(0);
    const credentials = await getDatabasePool().query(
      `SELECT id FROM "account" WHERE "userId" = $1`,
      [user.userId],
    );
    expect(credentials.rows).toHaveLength(0);

    const replacementId = `replacement-${randomUUID()}`;
    userIds.push(replacementId);
    await expect(
      getDatabasePool().query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, 'Replacement', $2, false, now(), now())`,
        [replacementId, user.email],
      ),
    ).resolves.toBeDefined();
  });
});
