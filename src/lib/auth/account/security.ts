import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { assertActiveProductAccount } from "./access";
import { consumeAccountEmailChallenge } from "./challenges";
import { AccountSecurityError } from "./errors";
import { deliverPostCommitAccountNotice } from "./notifications";
import { getAccountLifecycle } from "./repository";

type AccountIdentityRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

type CredentialRow = {
  id: string;
  password: string | null;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function projectTable(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

async function getIdentity(client: PoolClient, userId: string, lock = false) {
  const result = await client.query<AccountIdentityRow>(
    `SELECT id, name, email, "emailVerified" AS "emailVerified"
       FROM "user" WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  const identity = result.rows[0];
  if (!identity) throw new AccountSecurityError("account_unavailable");
  return identity;
}

async function getCredential(client: PoolClient, userId: string) {
  const result = await client.query<CredentialRow>(
    `SELECT id, password FROM "account"
      WHERE "userId" = $1 AND "providerId" = 'credential'
      LIMIT 1`,
    [userId],
  );
  const credential = result.rows[0];
  if (!credential?.password) {
    throw new AccountSecurityError("password_unavailable");
  }
  return credential;
}

export async function verifyAccountPasswordWithClient(
  client: PoolClient,
  userId: string,
  password: string,
) {
  const credential = await getCredential(client, userId);
  if (!await verifyPassword({ hash: credential.password!, password })) {
    throw new AccountSecurityError("password_incorrect");
  }
  return credential;
}

async function revokeOtherSessions(
  client: PoolClient,
  userId: string,
  currentSessionToken: string,
) {
  if (!currentSessionToken) {
    throw new AccountSecurityError("current_session_required");
  }
  await client.query(
    `DELETE FROM "session" WHERE "userId" = $1 AND token <> $2`,
    [userId, currentSessionToken],
  );
  await client.query(
    `DELETE FROM ${projectTable("admin_sessions")} WHERE user_id = $1`,
    [userId],
  );
}

async function withSecurityTransaction<T>(
  userId: string,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anonresume:account-deletion:${userId}`,
    ]);
    const lifecycle = await client.query<{ status: string }>(
      `SELECT status FROM ${projectTable("account_lifecycle")}
        WHERE user_id = $1`,
      [userId],
    );
    if (lifecycle.rows[0] && lifecycle.rows[0].status !== "active") {
      throw new AccountSecurityError("account_unavailable");
    }
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAccountProfile(userId: string) {
  await assertActiveProductAccount(userId);
  const client = await getDatabasePool().connect();
  try {
    const identity = await getIdentity(client, userId);
    const credential = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM "account"
          WHERE "userId" = $1 AND "providerId" = 'credential'
            AND password IS NOT NULL
       ) AS exists`,
      [userId],
    );
    return {
      name: identity.name,
      email: identity.email,
      emailVerified: identity.emailVerified,
      hasPassword: credential.rows[0]?.exists ?? false,
    };
  } finally {
    client.release();
  }
}

export async function updateAccountProfile(input: {
  userId: string;
  name: string;
}) {
  const name = input.name.trim();
  if (!name || name.length > 100) {
    throw new AccountSecurityError("account_unavailable");
  }
  return withSecurityTransaction(input.userId, async (client) => {
    const result = await client.query<{ name: string }>(
      `UPDATE "user" SET name = $2, "updatedAt" = now()
        WHERE id = $1 RETURNING name`,
      [input.userId, name],
    );
    if (!result.rows[0]) throw new AccountSecurityError("account_unavailable");
    return result.rows[0];
  });
}

export async function verifyAccountPassword(input: {
  userId: string;
  password: string;
  allowPendingDeletion?: boolean;
}) {
  if (input.allowPendingDeletion) {
    const lifecycle = await getAccountLifecycle(input.userId);
    if (lifecycle.status === "deleted") {
      throw new AccountSecurityError("account_unavailable");
    }
  } else {
    await assertActiveProductAccount(input.userId);
  }
  const client = await getDatabasePool().connect();
  try {
    await verifyAccountPasswordWithClient(client, input.userId, input.password);
  } finally {
    client.release();
  }
}

export async function changeAccountPassword(input: {
  userId: string;
  currentSessionToken: string;
  currentPassword: string;
  newPassword: string;
  notify: (identity: { email: string; name: string }) => Promise<void>;
}) {
  await assertActiveProductAccount(input.userId);
  if (input.newPassword.length < 12 || input.newPassword.length > 128) {
    throw new AccountSecurityError("password_invalid");
  }
  const passwordHash = await hashPassword(input.newPassword);
  const identity = await withSecurityTransaction(
    input.userId,
    async (client) => {
      const identity = await getIdentity(client, input.userId, true);
      const credential = await verifyAccountPasswordWithClient(
        client,
        input.userId,
        input.currentPassword,
      );
      await client.query(
        `UPDATE "account" SET password = $2, "updatedAt" = now()
          WHERE id = $1`,
        [credential.id, passwordHash],
      );
      await revokeOtherSessions(
        client,
        input.userId,
        input.currentSessionToken,
      );
      return identity;
    },
  );
  await deliverPostCommitAccountNotice(
    () => input.notify({ email: identity.email, name: identity.name }),
    "password_changed",
  );
}

export async function changeAccountEmail(input: {
  userId: string;
  currentSessionToken: string;
  currentPassword: string;
  newEmail: string;
  oldEmailCode: string;
  newEmailCode: string;
  now?: Date;
  notifyOldAddress: (identity: {
    email: string;
    name: string;
    newEmail: string;
  }) => Promise<void>;
}) {
  await assertActiveProductAccount(input.userId);
  const newEmail = input.newEmail.trim().toLowerCase();
  const binding = `email-change:${newEmail}`;
  const identityClient = await getDatabasePool().connect();
  let originalIdentity: AccountIdentityRow;
  try {
    originalIdentity = await getIdentity(identityClient, input.userId);
    await verifyAccountPasswordWithClient(
      identityClient,
      input.userId,
      input.currentPassword,
    );
  } finally {
    identityClient.release();
  }
  await consumeAccountEmailChallenge({
    userId: input.userId,
    purpose: "change_email_old",
    email: originalIdentity.email,
    binding,
    code: input.oldEmailCode,
    now: input.now,
  });
  await consumeAccountEmailChallenge({
    userId: input.userId,
    purpose: "change_email_new",
    email: newEmail,
    binding,
    code: input.newEmailCode,
    now: input.now,
  });
  const oldIdentity = await withSecurityTransaction(
    input.userId,
    async (client) => {
      const identity = await getIdentity(client, input.userId, true);
      if (identity.email !== originalIdentity.email) {
        throw new AccountSecurityError("account_unavailable");
      }
      await verifyAccountPasswordWithClient(
        client,
        input.userId,
        input.currentPassword,
      );
      try {
        await client.query(
          `UPDATE "user"
              SET email = $2, "emailVerified" = true, "updatedAt" = now()
            WHERE id = $1`,
          [input.userId, newEmail],
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new AccountSecurityError("email_in_use");
        }
        throw error;
      }
      await revokeOtherSessions(
        client,
        input.userId,
        input.currentSessionToken,
      );
      return identity;
    },
  );
  await deliverPostCommitAccountNotice(
    () => input.notifyOldAddress({
      email: oldIdentity.email,
      name: oldIdentity.name,
      newEmail,
    }),
    "email_changed",
  );
}

export async function listAccountSessions(input: {
  userId: string;
  currentSessionId: string;
}) {
  await assertActiveProductAccount(input.userId);
  const result = await getDatabasePool().query<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }>(
    `SELECT id, "createdAt" AS "createdAt", "updatedAt" AS "updatedAt",
            "expiresAt" AS "expiresAt", "ipAddress" AS "ipAddress",
            "userAgent" AS "userAgent"
       FROM "session" WHERE "userId" = $1
       ORDER BY "updatedAt" DESC, id ASC`,
    [input.userId],
  );
  return result.rows.map((session) => ({
    ...session,
    current: session.id === input.currentSessionId,
  }));
}

export async function revokeAccountSession(input: {
  userId: string;
  currentSessionId: string;
  sessionId: string;
}) {
  await assertActiveProductAccount(input.userId);
  if (input.currentSessionId === input.sessionId) {
    throw new AccountSecurityError("current_session_required");
  }
  const result = await getDatabasePool().query(
    `DELETE FROM "session" WHERE id = $1 AND "userId" = $2`,
    [input.sessionId, input.userId],
  );
  if (result.rowCount !== 1) {
    throw new AccountSecurityError("session_not_found");
  }
}

export async function revokeOtherAccountSessions(input: {
  userId: string;
  currentSessionToken: string;
}) {
  await assertActiveProductAccount(input.userId);
  await withSecurityTransaction(input.userId, (client) =>
    revokeOtherSessions(client, input.userId, input.currentSessionToken),
  );
}

export async function isPasswordResetAllowedForUser(userId: string) {
  return (await getAccountLifecycle(userId)).status === "active";
}

export async function isPasswordResetAllowedForToken(token: string) {
  const verification = await getDatabasePool().query<{ userId: string }>(
    `SELECT value AS "userId" FROM "verification"
      WHERE identifier = $1 AND "expiresAt" > now()
      LIMIT 1`,
    [`reset-password:${token}`],
  );
  const userId = verification.rows[0]?.userId;
  return userId ? isPasswordResetAllowedForUser(userId) : false;
}

export async function invalidatePasswordResetToken(token: string) {
  await getDatabasePool().query(
    `DELETE FROM "verification" WHERE identifier = $1`,
    [`reset-password:${token}`],
  );
}
