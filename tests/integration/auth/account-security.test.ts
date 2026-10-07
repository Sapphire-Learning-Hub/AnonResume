import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import {
  accountEmailChallenges,
  accountLifecycle,
  adminSessions,
  db,
} from "@/db";
import { getDatabaseSchemaName } from "@/db";
import {
  consumeAccountEmailChallenge,
  consumeAccountEmailChallenges,
  issueAccountEmailChallenge,
  verifyAccountEmailChallenge,
} from "@/lib/auth/account/challenges";
import { AccountSecurityError } from "@/lib/auth/account/errors";
import {
  changeAccountEmail,
  changeAccountPassword,
  isPasswordResetAllowedForToken,
  listAccountSessions,
  revokeAccountSession,
  updateCurrentAccountSessionDevice,
  updateAccountProfile,
} from "@/lib/auth/account/security";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account security", () => {
  const userIds: string[] = [];
  const schema = `"${getDatabaseSchemaName().replaceAll('"', '""')}"`;

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

  it("verifies a challenge without consuming it", async () => {
    const user = await createCredentialUser("verify-only");
    let code = "";
    await issueAccountEmailChallenge({
      userId: user.userId,
      purpose: "change_email_old",
      email: user.email,
      source: "127.0.0.1",
      deliver: async (value) => {
        code = value.code;
      },
    });

    await expect(verifyAccountEmailChallenge({
      userId: user.userId,
      purpose: "change_email_old",
      email: user.email,
      code,
    })).resolves.toEqual({ verified: true });
    await expect(consumeAccountEmailChallenge({
      userId: user.userId,
      purpose: "change_email_old",
      email: user.email,
      code,
    })).resolves.toEqual({ consumed: true });
  });

  it("does not consume either challenge when one code is invalid", async () => {
    const user = await createCredentialUser("atomic-challenges");
    const newEmail = `new-${user.email}`;
    const codes = new Map<string, string>();
    for (const [purpose, email, binding] of [
      ["change_email_old", user.email, undefined],
      ["change_email_new", newEmail, `email-change:${newEmail}`],
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

    await expect(consumeAccountEmailChallenges({
      userId: user.userId,
      challenges: [
        {
          purpose: "change_email_old",
          email: user.email,
          code: codes.get("change_email_old")!,
        },
        {
          purpose: "change_email_new",
          email: newEmail,
          binding: `email-change:${newEmail}`,
          code: "000000",
        },
      ],
    })).rejects.toMatchObject({ code: "challenge_code_invalid" });
    await expect(consumeAccountEmailChallenge({
      userId: user.userId,
      purpose: "change_email_old",
      email: user.email,
      code: codes.get("change_email_old")!,
    })).resolves.toEqual({ consumed: true });
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
    const currentSession = `${user.userId}-current`;
    await addSession(user.userId, currentSession);
    const otherSessionId = await addSession(user.userId, `${user.userId}-other`);
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
      currentSessionToken: currentSession,
      currentPassword: user.password,
      newPassword: "replacement-password-456",
      notify: async () => undefined,
    });

    const sessions = await getDatabasePool().query<{ token: string }>(
      `SELECT token FROM "session" WHERE "userId" = $1`,
      [user.userId],
    );
    expect(sessions.rows).toEqual([{ token: currentSession }]);
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

  it("revokes the management session associated with a removed device", async () => {
    const user = await createCredentialUser("session-revoke");
    const currentSessionId = await addSession(
      user.userId,
      `${user.userId}-current`,
    );
    const removedSessionId = await addSession(
      user.userId,
      `${user.userId}-removed`,
    );
    await db.insert(adminSessions).values({
      userId: user.userId,
      baseSessionId: removedSessionId,
      tokenHash: `admin-${randomUUID()}`,
      accessVersion: 1,
      lastSeenAt: new Date("2026-10-07T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-10-07T01:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-10-08T00:00:00.000Z"),
    });

    await revokeAccountSession({
      userId: user.userId,
      currentSessionId,
      sessionId: removedSessionId,
    });

    await expect(
      db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.userId, user.userId)),
    ).resolves.toHaveLength(0);
  });

  it("stores client-hint metadata only on the owned current session", async () => {
    const user = await createCredentialUser("session-device");
    const currentSessionId = await addSession(
      user.userId,
      `${user.userId}-current`,
    );
    const otherSessionId = await addSession(
      user.userId,
      `${user.userId}-other`,
    );

    await updateCurrentAccountSessionDevice({
      userId: user.userId,
      sessionId: currentSessionId,
      platform: "macOS",
      platformVersion: "26.0.1",
      model: null,
    });

    const sessions = await listAccountSessions({
      userId: user.userId,
      currentSessionId,
    });
    expect(sessions.find((session) => session.id === currentSessionId)).toMatchObject({
      current: true,
      platform: "macOS",
      platformVersion: "26.0.1",
      deviceModel: null,
    });
    expect(sessions.find((session) => session.id === otherSessionId)).toMatchObject({
      current: false,
      platform: null,
      platformVersion: null,
      deviceModel: null,
    });
  });

  it("does not report a committed password change as failed when the notice cannot be delivered", async () => {
    const user = await createCredentialUser("password-notice");
    const currentSession = `${user.userId}-current`;
    await addSession(user.userId, currentSession);

    await expect(changeAccountPassword({
      userId: user.userId,
      currentSessionToken: currentSession,
      currentPassword: user.password,
      newPassword: "replacement-password-456",
      notify: async () => {
        throw new Error("mail unavailable");
      },
    })).resolves.toBeUndefined();

    const credential = await getDatabasePool().query<{ password: string }>(
      `SELECT password FROM "account"
        WHERE "userId" = $1 AND "providerId" = 'credential'`,
      [user.userId],
    );
    await expect(verifyPassword({
      hash: credential.rows[0]!.password,
      password: "replacement-password-456",
    })).resolves.toBe(true);
  });

  it("rechecks lifecycle state after waiting for an account deletion transaction", async () => {
    const user = await createCredentialUser("password-deletion-race");
    const currentSession = `${user.userId}-current`;
    await addSession(user.userId, currentSession);
    const locker = await getDatabasePool().connect();

    try {
      await locker.query("BEGIN");
      await locker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `anonresume:account-deletion:${user.userId}`,
      ]);
      const passwordChange = changeAccountPassword({
        userId: user.userId,
        currentSessionToken: currentSession,
        currentPassword: user.password,
        newPassword: "replacement-password-456",
        notify: async () => undefined,
      });

      await new Promise((resolve) => setTimeout(resolve, 75));
      const requestedAt = new Date("2026-10-07T00:00:00.000Z");
      await locker.query(
        `INSERT INTO ${schema}.account_lifecycle
          (user_id, status, deletion_requested_at, deletion_due_at,
           created_at, updated_at)
         VALUES ($1, 'pending_deletion', $2, $3, $2, $2)`,
        [
          user.userId,
          requestedAt,
          new Date("2026-10-14T00:00:00.000Z"),
        ],
      );
      await locker.query("COMMIT");

      await expect(passwordChange).rejects.toMatchObject({
        code: "account_unavailable",
      });
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      locker.release();
    }
  });

  it("does not write profile data after a concurrent deletion request", async () => {
    const user = await createCredentialUser("profile-deletion-race");
    const locker = await getDatabasePool().connect();

    try {
      await locker.query("BEGIN");
      await locker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `anonresume:account-deletion:${user.userId}`,
      ]);
      const profileUpdate = updateAccountProfile({
        userId: user.userId,
        name: "Late profile value",
      });

      await new Promise((resolve) => setTimeout(resolve, 75));
      const requestedAt = new Date("2026-10-07T00:00:00.000Z");
      await locker.query(
        `INSERT INTO ${schema}.account_lifecycle
          (user_id, status, deletion_requested_at, deletion_due_at,
           created_at, updated_at)
         VALUES ($1, 'pending_deletion', $2, $3, $2, $2)`,
        [
          user.userId,
          requestedAt,
          new Date("2026-10-14T00:00:00.000Z"),
        ],
      );
      await locker.query("COMMIT");

      await expect(profileUpdate).rejects.toMatchObject({
        code: "account_unavailable",
      });
      const identity = await getDatabasePool().query<{ name: string }>(
        `SELECT name FROM "user" WHERE id = $1`,
        [user.userId],
      );
      expect(identity.rows[0]?.name).not.toBe("Late profile value");
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      locker.release();
    }
  });

  it("changes email only after old and new address challenges are consumed", async () => {
    const user = await createCredentialUser("email");
    const newEmail = `new-${user.email}`;
    const codes = new Map<string, string>();
    for (const [purpose, email] of [
      ["change_email_old", user.email],
      ["change_email_new", newEmail],
    ] as const) {
      await issueAccountEmailChallenge({
        userId: user.userId,
        purpose,
        email,
        binding: purpose === "change_email_new"
          ? `email-change:${newEmail.toLowerCase()}`
          : undefined,
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
