import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { getDatabaseSchemaName } from "@/db";

import {
  beginAdminMfaEnrollment,
  verifyAdminMfaEnrollment,
} from "./admin-store";
import { hashAdminSecret } from "./admin-crypto";
import { getDatabasePool } from "./database";

export class AdminActivationError extends Error {
  constructor(message = "The management activation link is invalid or expired") {
    super(message);
    this.name = "AdminActivationError";
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function getActivation(token: string, lock = false) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    if (lock) await client.query("BEGIN");
    const result = await client.query<{
      tokenId: string;
      userId: string;
      email: string;
      purpose: "super_admin" | "product_user" | "delegated_admin";
    }>(
      `SELECT token.id AS "tokenId", token.user_id AS "userId", identity.email,
              token.purpose
         FROM ${schema}.admin_activation_tokens AS token
         LEFT JOIN ${schema}.admin_principals AS principal
           ON principal.user_id = token.user_id AND principal.quarantined_at IS NULL
         JOIN "user" AS identity ON identity.id = token.user_id
        WHERE token.token_hash = $1
          AND token.consumed_at IS NULL
          AND token.expires_at > now()
          AND (
            token.purpose = 'product_user'
            OR (token.purpose = 'super_admin' AND principal.kind = 'super_admin')
            OR (token.purpose = 'delegated_admin' AND principal.kind = 'delegated_admin')
          )
        ${lock ? "FOR UPDATE OF token" : ""}
        LIMIT 1`,
      [hashAdminSecret(token)],
    );
    if (lock) await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    if (lock) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function inspectAdminActivation(token: string) {
  const activation = token ? await getActivation(token) : null;
  if (!activation) throw new AdminActivationError();
  return {
    email: activation.email,
    purpose: activation.purpose,
    requiresMfa: activation.purpose !== "product_user",
  };
}

async function completeProductUserActivation(input: {
  tokenId: string;
  userId: string;
  password: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      `UPDATE ${schema}.admin_activation_tokens
          SET consumed_at = now()
        WHERE id = $1 AND purpose = 'product_user'
          AND consumed_at IS NULL AND expires_at > now()
        RETURNING id`,
      [input.tokenId],
    );
    if (consumed.rowCount !== 1) throw new AdminActivationError();
    const now = new Date();
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')`,
      [randomUUID(), input.userId, passwordHash, now],
    );
    await client.query(
      `UPDATE "user" SET "emailVerified" = true, "updatedAt" = now()
        WHERE id = $1`,
      [input.userId],
    );
    await client.query("COMMIT");
    return { completed: true as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function startAdminActivation({
  token,
  password,
  deviceName,
}: {
  token: string;
  password: string;
  deviceName: string;
}) {
  if (password.length < 12 || password.length > 128) {
    throw new AdminActivationError("Password must contain 12 to 128 characters");
  }
  if (deviceName.trim().length > 60) {
    throw new AdminActivationError("MFA device name is too long");
  }

  const activation = await getActivation(token, true);
  if (!activation) throw new AdminActivationError();
  if (activation.purpose === "product_user") {
    return completeProductUserActivation({
      tokenId: activation.tokenId,
      userId: activation.userId,
      password,
    });
  }
  const pool = getDatabasePool();

  const schema = quoteIdentifier(getDatabaseSchemaName());
  await pool.query(
    `DELETE FROM ${schema}.admin_mfa_devices
      WHERE user_id = $1 AND verified_at IS NULL`,
    [activation.userId],
  );

  return {
    completed: false as const,
    userId: activation.userId,
    ...(await beginAdminMfaEnrollment({
      userId: activation.userId,
      email: activation.email,
      name: deviceName,
    })),
  };
}

export async function completeAdminActivation({
  token,
  deviceId,
  code,
  password,
}: {
  token: string;
  deviceId: string;
  code: string;
  password: string;
}) {
  if (password.length < 12 || password.length > 128) {
    throw new AdminActivationError("Password must contain 12 to 128 characters");
  }
  const activation = await getActivation(token);
  if (!activation) throw new AdminActivationError();
  if (activation.purpose === "product_user") throw new AdminActivationError();

  const recoveryCodes = await verifyAdminMfaEnrollment({
    userId: activation.userId,
    deviceId,
    token: code,
  });
  const passwordHash = await hashPassword(password);
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      `UPDATE ${schema}.admin_activation_tokens
          SET consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
        RETURNING id`,
      [activation.tokenId],
    );
    if (consumed.rowCount !== 1) throw new AdminActivationError();
    const now = new Date();
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')
       ON CONFLICT (issuer, "accountId") DO UPDATE
         SET password = EXCLUDED.password, "updatedAt" = EXCLUDED."updatedAt"`,
      [randomUUID(), activation.userId, passwordHash, now],
    );
    await client.query(
      `UPDATE "user" SET "emailVerified" = true, "updatedAt" = now()
        WHERE id = $1`,
      [activation.userId],
    );
    await client.query("COMMIT");
    return { recoveryCodes };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
