import { randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { db, socialRegistrationAttempts, userInvitations } from "@/db";
import { completeSocialRegistration } from "@/lib/auth/social-registration/completion";
import {
  captureSocialRegistrationProfile,
  createSocialRegistrationAttempt,
} from "@/lib/auth/social-registration/repository";
import {
  sendSocialRegistrationEmailChallenge,
  verifySocialRegistrationEmail,
} from "@/lib/auth/social-registration/email";
import { getDatabasePool } from "@/lib/runtime/database";

describe("social registration completion", () => {
  const userIds: string[] = [];
  const emails: string[] = [];

  async function createCapturedIntent(input: {
    email?: string | null;
    emailVerified?: boolean;
    now?: Date;
  } = {}) {
    const now = input.now ?? new Date("2026-10-10T06:00:00.000Z");
    const providerAccountId = `github-${randomUUID()}`;
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });
    await captureSocialRegistrationProfile({
      rawToken: attempt.rawToken,
      providerId: "github",
      providerAccountId,
      providerEmail: input.email ?? null,
      providerEmailVerified: input.emailVerified ?? false,
      displayName: "GitHub User",
      avatarUrl: "https://avatars.example/github",
      now,
    });
    return { ...attempt, now, providerAccountId };
  }

  async function verifyLocalEmail(
    rawToken: string,
    email: string,
    now: Date,
  ) {
    await sendSocialRegistrationEmailChallenge({
      rawToken,
      email,
      now,
      deliver: async () => undefined,
    }, { createCode: () => "123456" });
    await verifySocialRegistrationEmail({
      rawToken,
      code: "123456",
      now,
    });
  }

  async function loadIdentity(email: string) {
    return getDatabasePool().query<{
      email: string;
      emailVerified: boolean;
      id: string;
      image: string | null;
      name: string;
    }>(
      `SELECT id, email, name, image, "emailVerified" AS "emailVerified"
         FROM "user" WHERE lower(email) = $1`,
      [email.toLowerCase()],
    );
  }

  afterEach(async () => {
    await db.delete(socialRegistrationAttempts);
    for (const email of emails.splice(0)) {
      await db.delete(userInvitations).where(eq(
        userInvitations.invitedEmail,
        email,
      ));
    }
    if (userIds.length) {
      const ids = userIds.splice(0);
      await getDatabasePool().query(
        `DELETE FROM "account" WHERE "userId" = ANY($1::text[])`,
        [ids],
      );
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [ids],
      );
    }
  });

  it("creates credential and GitHub accounts from a verified provider email", async () => {
    const email = `provider-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent({
      email,
      emailVerified: true,
    });

    const result = await completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "  New User  ",
      password: "secure-password-123",
      now: attempt.now,
    });
    userIds.push(result.userId);

    expect(result).toEqual({ email, userId: expect.any(String) });
    const identity = await loadIdentity(email);
    expect(identity.rows[0]).toMatchObject({
      id: result.userId,
      name: "New User",
      emailVerified: true,
      image: "https://avatars.example/github",
    });
    const accounts = await getDatabasePool().query<{
      accountId: string;
      issuer: string;
      password: string | null;
      providerId: string;
    }>(
      `SELECT "accountId" AS "accountId", "providerId" AS "providerId",
              issuer, password
         FROM "account" WHERE "userId" = $1 ORDER BY "providerId"`,
      [result.userId],
    );
    expect(accounts.rows).toEqual([
      expect.objectContaining({
        accountId: result.userId,
        issuer: "local:credential",
        providerId: "credential",
      }),
      expect.objectContaining({
        accountId: attempt.providerAccountId,
        issuer: "local:oauth:github",
        password: null,
        providerId: "github",
      }),
    ]);
    const credential = accounts.rows.find(
      (account) => account.providerId === "credential",
    );
    expect(credential?.password).toBeTruthy();
    await expect(verifyPassword({
      hash: credential!.password!,
      password: "secure-password-123",
    })).resolves.toBe(true);
  });

  it("creates the same account shape after local email verification", async () => {
    const email = `local-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent();
    await verifyLocalEmail(attempt.rawToken, email, attempt.now);

    const result = await completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "Local Email User",
      password: "secure-password-123",
      now: attempt.now,
    });
    userIds.push(result.userId);

    expect(result.email).toBe(email);
    const accounts = await getDatabasePool().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "account" WHERE "userId" = $1`,
      [result.userId],
    );
    expect(accounts.rows[0]?.count).toBe(2);
  });

  it("validates display name and password bounds before writing", async () => {
    const email = `bounds-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent({
      email,
      emailVerified: true,
    });

    await expect(completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "",
      password: "secure-password-123",
      now: attempt.now,
    })).rejects.toMatchObject({ code: "display_name_invalid" });
    await expect(completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "User",
      password: "short7",
      now: attempt.now,
    })).rejects.toMatchObject({ code: "password_invalid" });
    await expect(loadIdentity(email)).resolves.toMatchObject({ rowCount: 0 });
  });

  it("invalidates pending invitations in the account creation transaction", async () => {
    const email = `invited-${randomUUID()}@example.com`;
    emails.push(email);
    await db.insert(userInvitations).values({
      inviterUserId: `inviter-${randomUUID()}`,
      invitedEmail: email,
      tokenHash: `token-${randomUUID()}`,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const attempt = await createCapturedIntent({ email, emailVerified: true });

    const result = await completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "Invited User",
      password: "secure-password-123",
      now: attempt.now,
    });
    userIds.push(result.userId);

    const [invitation] = await db.select().from(userInvitations).where(eq(
      userInvitations.invitedEmail,
      email,
    ));
    expect(invitation).toMatchObject({
      invalidationReason: "registered_independently",
      tokenHash: null,
    });
  });

  it("rejects existing emails and provider subjects without partial writes", async () => {
    const existingUserId = `existing-${randomUUID()}`;
    const existingEmail = `existing-${randomUUID()}@example.com`;
    userIds.push(existingUserId);
    emails.push(existingEmail);
    await getDatabasePool().query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Existing', $2, true, now(), now())`,
      [existingUserId, existingEmail],
    );
    const emailAttempt = await createCapturedIntent({
      email: existingEmail,
      emailVerified: true,
    });
    await expect(completeSocialRegistration({
      rawToken: emailAttempt.rawToken,
      displayName: "Collision",
      password: "secure-password-123",
      now: emailAttempt.now,
    })).rejects.toMatchObject({ code: "account_conflict" });

    const providerAttempt = await createCapturedIntent({
      email: `provider-owner-${randomUUID()}@example.com`,
      emailVerified: true,
    });
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'github', $3, now(), now(), 'local:oauth:github')`,
      [randomUUID(), providerAttempt.providerAccountId, existingUserId],
    );
    await expect(completeSocialRegistration({
      rawToken: providerAttempt.rawToken,
      displayName: "Collision",
      password: "secure-password-123",
      now: providerAttempt.now,
    })).rejects.toMatchObject({ code: "account_conflict" });
  });

  it("rejects stale intents", async () => {
    const email = `stale-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent({
      email,
      emailVerified: true,
      now: new Date("2026-10-10T00:00:00.000Z"),
    });

    await expect(completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "Stale User",
      password: "secure-password-123",
      now: new Date("2026-10-10T00:15:00.000Z"),
    })).rejects.toMatchObject({ code: "intent_expired" });
    await expect(loadIdentity(email)).resolves.toMatchObject({ rowCount: 0 });
  });

  it("allows exactly one of two concurrent completion attempts", async () => {
    const email = `concurrent-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent({ email, emailVerified: true });
    const complete = () => completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "Concurrent User",
      password: "secure-password-123",
      now: attempt.now,
    });

    const results = await Promise.allSettled([complete(), complete()]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof complete>>> =>
        result.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(1);
    userIds.push(fulfilled[0]!.value.userId);
    expect(results.filter((result) => result.status === "rejected"))
      .toHaveLength(1);
  });

  it("maps a concurrent unique-email race to an account conflict", async () => {
    const email = `race-${randomUUID()}@example.com`;
    emails.push(email);
    const [first, second] = await Promise.all([
      createCapturedIntent({ email, emailVerified: true }),
      createCapturedIntent({ email, emailVerified: true }),
    ]);
    const complete = (rawToken: string) => completeSocialRegistration({
      rawToken,
      displayName: "Race User",
      password: "secure-password-123",
      now: first.now,
    });

    const results = await Promise.allSettled([
      complete(first.rawToken),
      complete(second.rawToken),
    ]);
    const fulfilled = results.find(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof complete>>
      > => result.status === "fulfilled",
    );
    expect(fulfilled).toBeDefined();
    userIds.push(fulfilled!.value.userId);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({ code: "account_conflict" });
  });

  it("rolls back user and accounts when the transaction fails mid-flight", async () => {
    const email = `rollback-${randomUUID()}@example.com`;
    emails.push(email);
    const attempt = await createCapturedIntent({ email, emailVerified: true });

    await expect(completeSocialRegistration({
      rawToken: attempt.rawToken,
      displayName: "Rollback User",
      password: "secure-password-123",
      now: attempt.now,
    }, {
      afterAccountsCreated: async () => {
        throw new Error("injected failure");
      },
    })).rejects.toThrow("injected failure");

    await expect(loadIdentity(email)).resolves.toMatchObject({ rowCount: 0 });
  });
});
