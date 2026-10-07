import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { getDatabasePool } from "@/lib/runtime/database";

import { AccountSecurityError } from "./errors";
import { getAccountLifecycle } from "./repository";
import type { AccountEmailChallengePurpose } from "./types";

const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const CHALLENGE_RESEND_DELAY_MS = 60 * 1000;
const CHALLENGE_RATE_WINDOW_MS = 60 * 60 * 1000;
const CHALLENGE_RATE_LIMIT = 5;
const CHALLENGE_MAX_ATTEMPTS = 5;
const CHALLENGE_LOCK_PREFIX = "anonresume:account-challenge:";

type ChallengeRow = {
  id: string;
  emailHash: string;
  bindingHash: string | null;
  codeHash: string;
  failedAttempts: number;
  expiresAt: Date;
  resendAvailableAt: Date;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function challengeTable() {
  return `${quoteIdentifier(getDatabaseSchemaName())}.account_email_challenges`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function secretHash(namespace: string, value: string) {
  return createHmac("sha256", readBootstrapConfig().authSecret)
    .update(`${namespace}\0${value}`)
    .digest("hex");
}

function codeHash(id: string, code: string) {
  return secretHash("account-email-challenge-code", `${id}\0${code}`);
}

function equalHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function assertChallengeLifecycle(
  userId: string,
  purpose: AccountEmailChallengePurpose,
  now: Date,
) {
  const lifecycle = await getAccountLifecycle(userId);
  const allowed = purpose === "restore_account"
    ? lifecycle.status === "pending_deletion" &&
      Boolean(lifecycle.deletionDueAt && lifecycle.deletionDueAt > now)
    : lifecycle.status === "active";
  if (!allowed) throw new AccountSecurityError("account_unavailable");
}

async function withChallengeTransaction<T>(
  userId: string,
  purpose: AccountEmailChallengePurpose,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${CHALLENGE_LOCK_PREFIX}${userId}:${purpose}`,
    ]);
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    const preservesVerificationState =
      error instanceof AccountSecurityError &&
      (error.code === "challenge_code_invalid" ||
        error.code === "challenge_invalid" ||
        error.code === "challenge_expired");
    await client.query(preservesVerificationState ? "COMMIT" : "ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function issueAccountEmailChallenge(input: {
  userId: string;
  purpose: AccountEmailChallengePurpose;
  email: string;
  source: string;
  binding?: string;
  now?: Date;
  deliver: (value: { code: string; expiresAt: Date }) => Promise<void>;
}) {
  const now = input.now ?? new Date();
  await assertChallengeLifecycle(input.userId, input.purpose, now);
  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const emailHash = secretHash(
    "account-email-challenge-address",
    normalizeEmail(input.email),
  );
  const sourceHash = secretHash(
    "account-email-challenge-source",
    input.source,
  );
  const bindingHash = input.binding
    ? secretHash("account-email-challenge-binding", input.binding)
    : null;
  const expiresAt = new Date(now.getTime() + CHALLENGE_LIFETIME_MS);
  const resendAvailableAt = new Date(
    now.getTime() + CHALLENGE_RESEND_DELAY_MS,
  );

  await withChallengeTransaction(
    input.userId,
    input.purpose,
    async (client) => {
      const latest = await client.query<{ resendAvailableAt: Date }>(
        `SELECT resend_available_at AS "resendAvailableAt"
           FROM ${challengeTable()}
          WHERE user_id = $1 AND purpose = $2
            AND consumed_at IS NULL AND invalidated_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [input.userId, input.purpose],
      );
      if (latest.rows[0]?.resendAvailableAt > now) {
        throw new AccountSecurityError("challenge_resend_too_soon");
      }

      const rate = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM ${challengeTable()}
          WHERE purpose = $1 AND created_at >= $2
            AND (user_id = $3 OR email_hash = $4 OR source_hash = $5)`,
        [
          input.purpose,
          new Date(now.getTime() - CHALLENGE_RATE_WINDOW_MS),
          input.userId,
          emailHash,
          sourceHash,
        ],
      );
      if ((rate.rows[0]?.count ?? 0) >= CHALLENGE_RATE_LIMIT) {
        throw new AccountSecurityError("challenge_rate_limited");
      }

      await client.query(
        `UPDATE ${challengeTable()}
            SET invalidated_at = $3, updated_at = $3
          WHERE user_id = $1 AND purpose = $2
            AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [input.userId, input.purpose, now],
      );
      await client.query(
        `INSERT INTO ${challengeTable()}
          (id, user_id, purpose, email_hash, source_hash, binding_hash,
           code_hash, failed_attempts, expires_at, resend_available_at,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $10)`,
        [
          id,
          input.userId,
          input.purpose,
          emailHash,
          sourceHash,
          bindingHash,
          codeHash(id, code),
          expiresAt,
          resendAvailableAt,
          now,
        ],
      );
    },
  );

  try {
    await input.deliver({ code, expiresAt });
  } catch (error) {
    await getDatabasePool().query(
      `UPDATE ${challengeTable()}
          SET invalidated_at = now(), updated_at = now()
        WHERE id = $1 AND consumed_at IS NULL`,
      [id],
    );
    throw error;
  }

  return { expiresAt, resendAvailableAt };
}

export async function consumeAccountEmailChallenge(input: {
  userId: string;
  purpose: AccountEmailChallengePurpose;
  email: string;
  code: string;
  binding?: string;
  now?: Date;
  client?: PoolClient;
}) {
  const consume = async (client: PoolClient) => {
    const result = await client.query<ChallengeRow>(
      `SELECT id, email_hash AS "emailHash", binding_hash AS "bindingHash",
              code_hash AS "codeHash", failed_attempts AS "failedAttempts",
              expires_at AS "expiresAt",
              resend_available_at AS "resendAvailableAt"
         FROM ${challengeTable()}
        WHERE user_id = $1 AND purpose = $2
          AND consumed_at IS NULL AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [input.userId, input.purpose],
    );
    const challenge = result.rows[0];
    if (!challenge) throw new AccountSecurityError("challenge_invalid");

    const now = input.now ?? new Date();
    if (challenge.expiresAt <= now) {
      await client.query(
        `UPDATE ${challengeTable()}
            SET invalidated_at = $2, updated_at = $2 WHERE id = $1`,
        [challenge.id, now],
      );
      throw new AccountSecurityError("challenge_expired");
    }

    const expectedEmailHash = secretHash(
      "account-email-challenge-address",
      normalizeEmail(input.email),
    );
    const expectedBindingHash = input.binding
      ? secretHash("account-email-challenge-binding", input.binding)
      : null;
    if (
      !equalHash(challenge.emailHash, expectedEmailHash) ||
      challenge.bindingHash !== expectedBindingHash
    ) {
      throw new AccountSecurityError("challenge_invalid");
    }

    if (!/^\d{6}$/.test(input.code) || !equalHash(challenge.codeHash, codeHash(challenge.id, input.code))) {
      const failedAttempts = challenge.failedAttempts + 1;
      await client.query(
        `UPDATE ${challengeTable()}
            SET failed_attempts = $2::integer,
                invalidated_at = CASE
                  WHEN $2::integer >= $3::integer
                  THEN $4::timestamptz
                  ELSE invalidated_at
                END,
                updated_at = $4::timestamptz
          WHERE id = $1`,
        [challenge.id, failedAttempts, CHALLENGE_MAX_ATTEMPTS, now],
      );
      throw new AccountSecurityError(
        failedAttempts >= CHALLENGE_MAX_ATTEMPTS
          ? "challenge_invalid"
          : "challenge_code_invalid",
      );
    }

    await client.query(
      `UPDATE ${challengeTable()}
          SET consumed_at = $2, updated_at = $2 WHERE id = $1`,
      [challenge.id, now],
    );
    return { consumed: true as const };
  };

  if (input.client) return consume(input.client);
  await assertChallengeLifecycle(input.userId, input.purpose, input.now ?? new Date());
  return withChallengeTransaction(input.userId, input.purpose, consume);
}
