import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import {
  accountEmailChallenges,
  accountLifecycle,
  adminSessions,
  db,
} from "@/db";
import {
  consumeAccountEmailChallenge,
  issueAccountEmailChallenge,
} from "@/lib/auth/account/challenges";
import { AccountSecurityError } from "@/lib/auth/account/errors";
import {
  changeAccountEmail,
  changeAccountPassword,
  isPasswordResetAllowedForToken,
} from "@/lib/auth/account/security";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account security", () => {
  const userIds: string[] = [];

  async function createCredentialUser(label: string) {
    const userId = `account-security-${label}-${randomUUID()}`;
    const email = `${userId}@example.com`;
    const password = "current-password-123";
    const now = new Date("2026-10-07T00:00:00.000Z");
    userIds.push(userId);

    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $4)`,
      [userId, label, email, now],
    );
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'credential')`,
      [randomUUID(), userId, await hashPassword(password), now],
    );

    return { email, password, userId };
  }

  async function addSession(userId: string, token: string) {
    const now = new Date("2026-10-07T00:00:00.000Z");
    const id = randomUUID();
    await getDatabasePool().query(
      `INSERT INTO "session"
        (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        id,
        userId,
        token,
        new Date("2026-11-07T00:00:00.000Z"),
        now,
      ],
    );
    return id;
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db
        .delete(accountEmailChallenges)
        .where(eq(accountEmailChallenges.userId, userId));
      await db
        .delete(accountLifecycle)
        .where(eq(accountLifecycle.userId, userId));
      await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
      await getDatabasePool().query(
        `DELETE FROM "verification" WHERE value = $1`,
        [userId],
      );
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

  it("expires, consumes once, and isolates challenges by purpose and address", async () => {
    const user = await createCredentialUser("challenge");
    let code = "";
    await issueAccountEmailChallenge({
      userId: user.userId,
      purpose: "change_email_old",
      email: user.email,
      source: "127.0.0.1",
      now: new Date("2026-10-07T00:00:00.000Z"),
      deliver: async (value) => {
        code = value.code;
      },
    });

    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "change_email_new",
        email: user.email,
        code,
        now: new Date("2026-10-07T00:01:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "challenge_invalid" });
    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "change_email_old",
        email: `other-${user.email}`,
        code,
        now: new Date("2026-10-07T00:01:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "challenge_invalid" });

    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "change_email_old",
        email: user.email,
        code,
        now: new Date("2026-10-07T00:01:00.000Z"),
      }),
    ).resolves.toEqual({ consumed: true });
    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "change_email_old",
        email: user.email,
        code,
        now: new Date("2026-10-07T00:02:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "challenge_invalid" });

    await issueAccountEmailChallenge({
      userId: user.userId,
      purpose: "delete_account",
      email: user.email,
      source: "127.0.0.1",
      now: new Date("2026-10-07T01:00:00.000Z"),
      deliver: async (value) => {
        code = value.code;
      },
    });
    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "delete_account",
        email: user.email,
        code,
        now: new Date("2026-10-07T01:10:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "challenge_expired" });
  });

  it("invalidates a challenge after five failed attempts", async () => {
    const user = await createCredentialUser("attempts");
    await issueAccountEmailChallenge({
      userId: user.userId,
      purpose: "delete_account",
      email: user.email,
      source: "127.0.0.1",
      deliver: async () => undefined,
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(
        consumeAccountEmailChallenge({
          userId: user.userId,
          purpose: "delete_account",
          email: user.email,
          code: "000000",
        }),
      ).rejects.toMatchObject({
        code: attempt === 5 ? "challenge_invalid" : "challenge_code_invalid",
      });
    }
  });

  it("enforces resend delay and replaces the previous code", async () => {
    const user = await createCredentialUser("resend");
    const codes: string[] = [];
    const issue = (now: Date) =>
      issueAccountEmailChallenge({
        userId: user.userId,
        purpose: "delete_account" as const,
        email: user.email,
        source: "127.0.0.1",
        now,
        deliver: async ({ code }) => {
          codes.push(code);
        },
      });

    await issue(new Date("2026-10-07T00:00:00.000Z"));
    await expect(
      issue(new Date("2026-10-07T00:00:59.999Z")),
    ).rejects.toMatchObject({ code: "challenge_resend_too_soon" });
    await issue(new Date("2026-10-07T00:01:00.000Z"));

    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "delete_account",
        email: user.email,
        code: codes[0]!,
        now: new Date("2026-10-07T00:02:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "challenge_code_invalid" });
    await expect(
      consumeAccountEmailChallenge({
        userId: user.userId,
        purpose: "delete_account",
        email: user.email,
        code: codes[1]!,
        now: new Date("2026-10-07T00:02:00.000Z"),
      }),
    ).resolves.toEqual({ consumed: true });
  });

  it("changes a password while keeping only the current ordinary session", async () => {
    const user = await createCredentialUser("password");
    await addSession(user.userId, "current-session");
    const otherSessionId = await addSession(user.userId, "other-session");
    await db.insert(adminSessions).values({
      userId: user.userId,
      baseSessionId: otherSessionId,
      tokenHash: `admin-${randomUUID()}`,
      accessVersion: 1,
      lastSeenAt: new Date("2026-10-07T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-10-07T01:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-10-08T00:00:00.000Z"),
    });

    await changeAccountPassword({
      userId: user.userId,
      currentSessionToken: "current-session",
      currentPassword: user.password,
      newPassword: "replacement-password-456",
      notify: async () => undefined,
    });

    const sessions = await getDatabasePool().query<{ token: string }>(
      `SELECT token FROM "session" WHERE "userId" = $1`,
      [user.userId],
    );
    expect(sessions.rows).toEqual([{ token: "current-session" }]);
    await expect(
      db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.userId, user.userId)),
    ).resolves.toHaveLength(0);
    const credential = await getDatabasePool().query<{ password: string }>(
      `SELECT password FROM "account"
        WHERE "userId" = $1 AND "providerId" = 'credential'`,
      [user.userId],
    );
    await expect(
      verifyPassword({
        hash: credential.rows[0]!.password,
        password: "replacement-password-456",
      }),
    ).resolves.toBe(true);
  });

  it("changes email only after old and new address challenges are consumed", async () => {
    const user = await createCredentialUser("email");
    const newEmail = `new-${user.email}`;
    const binding = `email-change:${newEmail.toLowerCase()}`;
    const codes = new Map<string, string>();
    for (const [purpose, email] of [
      ["change_email_old", user.email],
      ["change_email_new", newEmail],
    ] as const) {
      await issueAccountEmailChallenge({
        userId: user.userId,
        purpose,
        email,
        binding,
        source: "127.0.0.1",
        deliver: async ({ code }) => {
          codes.set(purpose, code);
        },
      });
    }

    await changeAccountEmail({
      userId: user.userId,
      currentSessionToken: "missing-current-session",
      currentPassword: user.password,
      newEmail,
      oldEmailCode: codes.get("change_email_old")!,
      newEmailCode: codes.get("change_email_new")!,
      notifyOldAddress: async () => undefined,
    });

    const updated = await getDatabasePool().query<{
      email: string;
      emailVerified: boolean;
    }>(
      `SELECT email, "emailVerified" AS "emailVerified"
         FROM "user" WHERE id = $1`,
      [user.userId],
    );
    expect(updated.rows[0]).toEqual({
      email: newEmail,
      emailVerified: true,
    });
    await expect(
      db
        .select()
        .from(accountEmailChallenges)
        .where(
          and(
            eq(accountEmailChallenges.userId, user.userId),
            eq(accountEmailChallenges.purpose, "change_email_old"),
          ),
        ),
    ).resolves.toEqual([
      expect.objectContaining({ consumedAt: expect.any(Date) }),
    ]);
  });

  it("rejects password-reset tokens after deletion becomes pending", async () => {
    const user = await createCredentialUser("reset");
    const token = randomUUID();
    await getDatabasePool().query(
      `INSERT INTO "verification" (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), now())`,
      [
        randomUUID(),
        `reset-password:${token}`,
        user.userId,
        new Date("2026-10-08T00:00:00.000Z"),
      ],
    );
    await db.insert(accountLifecycle).values({
      userId: user.userId,
      status: "pending_deletion",
      deletionRequestedAt: new Date("2026-10-07T00:00:00.000Z"),
      deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
    });

    await expect(isPasswordResetAllowedForToken(token)).resolves.toBe(false);
  });

  it("reports a stable error when a password-only action has no credential", async () => {
    const user = await createCredentialUser("social");
    await getDatabasePool().query(
      `DELETE FROM "account" WHERE "userId" = $1`,
      [user.userId],
    );

    await expect(
      changeAccountPassword({
        userId: user.userId,
        currentSessionToken: "current",
        currentPassword: user.password,
        newPassword: "replacement-password-456",
        notify: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(AccountSecurityError);
  });
});
