import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import {
  accountLifecycle,
  accountMergeLocks,
  accountMergeOperations,
  accountSocialLinkAttempts,
  db,
} from "@/db";
import { AccountMergeError } from "@/lib/auth/account/merge/errors";
import {
  captureSocialLinkProviderSubject,
  createSocialLinkAttempt,
  resolveSocialLinkAttempt,
} from "@/lib/auth/account/merge/link-attempts";
import {
  cancelVerifiedAccountMerge,
  confirmVerifiedAccountMerge,
  getAccountMergeIntentMetadata,
  verifyAccountMergeIntent,
} from "@/lib/auth/account/merge/service";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account merge verification", () => {
  const userIds: string[] = [];

  async function createUser(label: string, password = "valid-password-123") {
    const id = `${label}-${randomUUID()}`;
    userIds.push(id);
    await getDatabasePool().query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [id, label, `${id}@example.com`],
    );
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password,
         "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, now(), now(), 'credential')`,
      [randomUUID(), id, await hashPassword(password)],
    );
    return { id, email: `${id}@example.com`, password };
  }

  async function createIntent() {
    const current = await createUser("merge-current");
    const target = await createUser("merge-target");
    const githubAccountId = `github-${randomUUID()}`;
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'github', $3, now(), now(), 'github')`,
      [randomUUID(), githubAccountId, target.id],
    );
    const sessionToken = `session-${randomUUID()}`;
    const attempt = await createSocialLinkAttempt({
      userId: current.id,
      sessionToken,
      providerId: "github",
    });
    await captureSocialLinkProviderSubject({
      rawToken: attempt.rawToken,
      providerId: "github",
      providerAccountId: githubAccountId,
    });
    const collision = await resolveSocialLinkAttempt({
      rawToken: attempt.rawToken,
      userId: current.id,
      sessionToken,
      providerId: "github",
      outcome: "error",
      errorCode: "account_already_linked_to_different_user",
      collisionProofValid: true,
    });
    if (collision.kind !== "collision") throw new Error("Expected collision");
    return {
      current,
      target,
      sessionToken,
      rawIntentToken: collision.rawIntentToken,
    };
  }

  afterEach(async () => {
    await db.delete(accountMergeLocks);
    await db.delete(accountMergeOperations);
    await db.delete(accountSocialLinkAttempts);
    if (userIds.length) {
      await db.delete(accountLifecycle);
    }
    if (userIds.length) {
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [userIds.splice(0)],
      );
    }
  });

  it("reveals no target summary before both account credentials are proven", async () => {
    const fixture = await createIntent();
    await expect(getAccountMergeIntentMetadata({
      rawIntentToken: fixture.rawIntentToken,
      userId: fixture.current.id,
      sessionToken: fixture.sessionToken,
    })).resolves.toEqual({ providerId: "github", requiresAdminMfa: false });

    await expect(verifyAccountMergeIntent({
      rawIntentToken: fixture.rawIntentToken,
      userId: fixture.current.id,
      sessionToken: fixture.sessionToken,
      currentPassword: fixture.current.password,
      targetEmail: "wrong@example.com",
      targetPassword: fixture.target.password,
      locale: "zh-CN",
    })).rejects.toEqual(expect.objectContaining({
      code: "target_credentials_invalid",
    }));
  });

  it("creates a five-second challenge with masked summaries and symbolic choices", async () => {
    const fixture = await createIntent();
    const now = new Date("2026-10-09T12:00:00.000Z");
    const verified = await verifyAccountMergeIntent({
      rawIntentToken: fixture.rawIntentToken,
      userId: fixture.current.id,
      sessionToken: fixture.sessionToken,
      currentPassword: fixture.current.password,
      targetEmail: fixture.target.email.toUpperCase(),
      targetPassword: fixture.target.password,
      locale: "zh-CN",
      now,
    });

    expect(verified).toMatchObject({
      confirmNotBefore: new Date("2026-10-09T12:00:05.000Z"),
      allowedPrimaryChoices: ["current", "target"],
      defaultPrimaryChoice: "current",
      requiresAdminMfa: false,
      current: { email: "m***@example.com", loginMethods: ["credential"] },
      target: {
        email: "m***@example.com",
        loginMethods: ["credential", "github"],
      },
    });
    expect(verified).not.toHaveProperty("current.userId");
    expect(verified).not.toHaveProperty("target.userId");

    await expect(confirmVerifiedAccountMerge({
      rawStatusToken: verified.rawStatusToken,
      userId: fixture.current.id,
      primaryChoice: "current",
      now: new Date("2026-10-09T12:00:04.999Z"),
    })).rejects.toEqual(expect.objectContaining({
      code: "confirmation_too_early",
    }));

    await expect(confirmVerifiedAccountMerge({
      rawStatusToken: verified.rawStatusToken,
      userId: fixture.current.id,
      primaryChoice: "current",
      now: new Date("2026-10-09T12:00:05.000Z"),
    })).resolves.toMatchObject({ state: "completed" });
    await expect(db.select().from(accountMergeLocks)).resolves.toHaveLength(0);
  });

  it("invalidates verification if provider ownership changes", async () => {
    const fixture = await createIntent();
    await getDatabasePool().query(
      `DELETE FROM "account" WHERE "providerId" = 'github' AND "userId" = $1`,
      [fixture.target.id],
    );

    await expect(verifyAccountMergeIntent({
      rawIntentToken: fixture.rawIntentToken,
      userId: fixture.current.id,
      sessionToken: fixture.sessionToken,
      currentPassword: fixture.current.password,
      targetEmail: fixture.target.email,
      targetPassword: fixture.target.password,
      locale: "en-US",
    })).rejects.toBeInstanceOf(AccountMergeError);
  });

  it("cancels a verified operation before confirmation", async () => {
    const fixture = await createIntent();
    const verified = await verifyAccountMergeIntent({
      rawIntentToken: fixture.rawIntentToken,
      userId: fixture.current.id,
      sessionToken: fixture.sessionToken,
      currentPassword: fixture.current.password,
      targetEmail: fixture.target.email,
      targetPassword: fixture.target.password,
      locale: "zh-CN",
    });

    await expect(cancelVerifiedAccountMerge({
      rawStatusToken: verified.rawStatusToken,
      userId: fixture.current.id,
    })).resolves.toEqual({ state: "cancelled" });
    await expect(confirmVerifiedAccountMerge({
      rawStatusToken: verified.rawStatusToken,
      userId: fixture.current.id,
      primaryChoice: "current",
      now: verified.confirmNotBefore,
    })).rejects.toMatchObject({ code: "operation_invalid" });
  });
});
