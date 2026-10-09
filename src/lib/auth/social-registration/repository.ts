import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { PoolClient } from "pg";

import { db, socialRegistrationAttempts } from "@/db";
import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { SocialRegistrationError } from "./errors";
import {
  createSocialRegistrationToken,
  hashSocialRegistrationToken,
} from "./tokens";
import type {
  SocialRegistrationAttempt,
  SocialRegistrationIntentView,
  SocialRegistrationProvider,
} from "./types";

export const SOCIAL_REGISTRATION_ATTEMPT_COOKIE =
  "anonresume_social_registration_attempt";

const SOCIAL_REGISTRATION_LIFETIME_MS = 15 * 60 * 1000;
export const SOCIAL_REGISTRATION_MAX_AGE_SECONDS =
  SOCIAL_REGISTRATION_LIFETIME_MS / 1000;

type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type EmailChallengeAttemptRow = {
  id: string;
  state: SocialRegistrationAttempt["state"];
  providerEmailVerified: boolean;
  selectedEmail: string | null;
  emailCodeHash: string | null;
  emailCodeExpiresAt: Date | null;
  emailCodeSentAt: Date | null;
  emailCodeAttempts: number;
  expiresAt: Date;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function socialRegistrationTable() {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(
    "account_social_registration_attempts",
  )}`;
}

function normalizeOptionalEmail(email: string | null) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function intentDigest(rawToken: string) {
  return hashSocialRegistrationToken("intent", rawToken);
}

async function withEmailChallengeTransaction<T>(
  rawToken: string,
  callback: (
    client: PoolClient,
    attempt: EmailChallengeAttemptRow,
  ) => Promise<T>,
) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<EmailChallengeAttemptRow>(
      `SELECT id, state,
              provider_email_verified AS "providerEmailVerified",
              selected_email AS "selectedEmail",
              email_code_hash AS "emailCodeHash",
              email_code_expires_at AS "emailCodeExpiresAt",
              email_code_sent_at AS "emailCodeSentAt",
              email_code_attempts AS "emailCodeAttempts",
              expires_at AS "expiresAt"
         FROM ${socialRegistrationTable()}
        WHERE token_hash = $1
        FOR UPDATE`,
      [intentDigest(rawToken)],
    );
    const attempt = result.rows[0];
    if (!attempt) throw new SocialRegistrationError("intent_invalid");
    const value = await callback(client, attempt);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createSocialRegistrationAttempt(input: {
  providerId: SocialRegistrationProvider;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = createSocialRegistrationToken("intent");
  const expiresAt = new Date(now.getTime() + SOCIAL_REGISTRATION_LIFETIME_MS);

  await db.insert(socialRegistrationAttempts).values({
    tokenHash: token.digest,
    providerId: input.providerId,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  return { rawToken: token.raw, expiresAt };
}

export async function captureSocialRegistrationProfile(input: {
  rawToken: string;
  providerId: SocialRegistrationProvider;
  providerAccountId: string;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const providerEmail = normalizeOptionalEmail(input.providerEmail);
  const hasVerifiedEmail = Boolean(
    input.providerEmailVerified && providerEmail,
  );
  const rows = await db.update(socialRegistrationAttempts).set({
    providerAccountId: input.providerAccountId,
    providerEmail,
    providerEmailVerified: hasVerifiedEmail,
    selectedEmail: hasVerifiedEmail ? providerEmail : null,
    displayName: input.displayName.trim(),
    avatarUrl: input.avatarUrl,
    state: hasVerifiedEmail ? "profile_captured" : "email_pending",
    updatedAt: now,
  }).where(and(
    eq(socialRegistrationAttempts.tokenHash, intentDigest(input.rawToken)),
    eq(socialRegistrationAttempts.providerId, input.providerId),
    eq(socialRegistrationAttempts.state, "started"),
    gt(socialRegistrationAttempts.expiresAt, now),
  )).returning({ id: socialRegistrationAttempts.id });

  return rows.length === 1;
}

async function expireAttempt(rawToken: string, now: Date) {
  const rows = await db.update(socialRegistrationAttempts).set({
    state: "expired",
    consumedAt: now,
    updatedAt: now,
  }).where(and(
    eq(socialRegistrationAttempts.tokenHash, intentDigest(rawToken)),
    lte(socialRegistrationAttempts.expiresAt, now),
    inArray(socialRegistrationAttempts.state, [
      "started",
      "profile_captured",
      "email_pending",
      "email_verified",
    ]),
  )).returning({ id: socialRegistrationAttempts.id });
  return rows.length === 1;
}

export async function inspectSocialRegistrationIntent(input: {
  rawToken: string;
  now?: Date;
}): Promise<SocialRegistrationIntentView> {
  const now = input.now ?? new Date();
  const [attempt] = await db.select().from(socialRegistrationAttempts).where(eq(
    socialRegistrationAttempts.tokenHash,
    intentDigest(input.rawToken),
  )).limit(1);

  if (!attempt) throw new SocialRegistrationError("intent_invalid");
  if (attempt.expiresAt <= now) {
    await expireAttempt(input.rawToken, now);
    throw new SocialRegistrationError("intent_expired");
  }
  if (attempt.state === "started") {
    throw new SocialRegistrationError("profile_missing");
  }
  if (
    !["profile_captured", "email_pending", "email_verified"].includes(
      attempt.state,
    ) ||
    !attempt.providerAccountId ||
    !attempt.displayName
  ) {
    throw new SocialRegistrationError("intent_invalid");
  }

  const requiresEmail = attempt.state === "email_pending";
  return {
    state: requiresEmail ? "email" : "password",
    displayName: attempt.displayName,
    imageUrl: attempt.avatarUrl,
    email: requiresEmail ? null : attempt.selectedEmail,
  };
}

export async function cancelSocialRegistrationAttempt(input: {
  rawToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rows = await db.update(socialRegistrationAttempts).set({
    state: "cancelled",
    consumedAt: now,
    updatedAt: now,
  }).where(and(
    eq(socialRegistrationAttempts.tokenHash, intentDigest(input.rawToken)),
    inArray(socialRegistrationAttempts.state, [
      "started",
      "profile_captured",
      "email_pending",
      "email_verified",
    ]),
  )).returning({ id: socialRegistrationAttempts.id });
  return rows.length === 1;
}

export async function consumeSocialRegistrationAttempt(input: {
  rawToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rows = await db.update(socialRegistrationAttempts).set({
    state: "completed",
    consumedAt: now,
    emailCodeHash: null,
    emailCodeExpiresAt: null,
    updatedAt: now,
  }).where(and(
    eq(socialRegistrationAttempts.tokenHash, intentDigest(input.rawToken)),
    inArray(socialRegistrationAttempts.state, [
      "profile_captured",
      "email_verified",
    ]),
    gt(socialRegistrationAttempts.expiresAt, now),
  )).returning({ id: socialRegistrationAttempts.id });
  return rows.length === 1;
}

export async function findSocialRegistrationConflict(input: {
  rawToken: string;
  now?: Date;
}): Promise<"email" | "provider" | null> {
  const now = input.now ?? new Date();
  const [attempt] = await db.select().from(socialRegistrationAttempts).where(
    and(
      eq(
        socialRegistrationAttempts.tokenHash,
        intentDigest(input.rawToken),
      ),
      inArray(socialRegistrationAttempts.state, [
        "profile_captured",
        "email_pending",
        "email_verified",
      ]),
      gt(socialRegistrationAttempts.expiresAt, now),
    ),
  ).limit(1);
  if (!attempt?.providerAccountId) {
    throw new SocialRegistrationError("intent_invalid");
  }

  const pool = getDatabasePool();
  const [provider, email] = await Promise.all([
    pool.query<{ id: string }>(
      `SELECT id FROM "account"
        WHERE "providerId" = $1 AND "accountId" = $2
        LIMIT 1`,
      [attempt.providerId, attempt.providerAccountId],
    ),
    attempt.selectedEmail
      ? pool.query<{ id: string }>(
          `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
          [attempt.selectedEmail],
        )
      : Promise.resolve({ rows: [] }),
  ]);
  if (provider.rows[0]) return "provider";
  if (email.rows[0]) return "email";
  return null;
}

export async function storeSocialRegistrationEmailChallenge(input: {
  rawToken: string;
  email: string;
  codeHash: string;
  codeExpiresAt: Date;
  now: Date;
  resendDelayMs: number;
}) {
  const outcome = await withEmailChallengeTransaction(
    input.rawToken,
    async (client, attempt) => {
      if (attempt.expiresAt <= input.now) {
        await client.query(
          `UPDATE ${socialRegistrationTable()}
              SET state = 'expired', consumed_at = $2, updated_at = $2
            WHERE id = $1`,
          [attempt.id, input.now],
        );
        return { error: "intent_expired" as const };
      }
      if (attempt.providerEmailVerified || attempt.state === "profile_captured") {
        return { error: "email_not_required" as const };
      }
      if (attempt.state !== "email_pending") {
        return { error: "intent_invalid" as const };
      }
      if (
        attempt.emailCodeSentAt &&
        attempt.emailCodeSentAt.getTime() + input.resendDelayMs >
          input.now.getTime()
      ) {
        return { error: "email_resend_too_soon" as const };
      }

      await client.query(
        `UPDATE ${socialRegistrationTable()}
            SET selected_email = $2,
                email_code_hash = $3,
                email_code_expires_at = $4,
                email_code_sent_at = $5,
                email_code_attempts = 0,
                updated_at = $5
          WHERE id = $1`,
        [
          attempt.id,
          input.email,
          input.codeHash,
          input.codeExpiresAt,
          input.now,
        ],
      );
      return { error: null };
    },
  );
  if (outcome.error) throw new SocialRegistrationError(outcome.error);
}

export async function invalidateSocialRegistrationEmailChallenge(input: {
  rawToken: string;
  codeHash: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await db.update(socialRegistrationAttempts).set({
    emailCodeHash: null,
    emailCodeExpiresAt: null,
    updatedAt: now,
  }).where(and(
    eq(socialRegistrationAttempts.tokenHash, intentDigest(input.rawToken)),
    eq(socialRegistrationAttempts.emailCodeHash, input.codeHash),
    eq(socialRegistrationAttempts.state, "email_pending"),
  ));
}

export async function verifyStoredSocialRegistrationEmail(input: {
  rawToken: string;
  expectedCodeHash: string;
  now: Date;
  maxAttempts: number;
}) {
  const outcome = await withEmailChallengeTransaction(
    input.rawToken,
    async (client, attempt) => {
      if (attempt.expiresAt <= input.now) {
        await client.query(
          `UPDATE ${socialRegistrationTable()}
              SET state = 'expired', consumed_at = $2, updated_at = $2
            WHERE id = $1`,
          [attempt.id, input.now],
        );
        return { error: "intent_expired" as const };
      }
      if (attempt.state !== "email_pending" || !attempt.selectedEmail) {
        return {
          error: attempt.providerEmailVerified
            ? "email_not_required" as const
            : "intent_invalid" as const,
        };
      }
      if (attempt.emailCodeAttempts >= input.maxAttempts) {
        return { error: "email_attempts_exhausted" as const };
      }
      if (!attempt.emailCodeHash || !attempt.emailCodeExpiresAt) {
        return { error: "email_code_invalid" as const };
      }
      if (attempt.emailCodeExpiresAt <= input.now) {
        await client.query(
          `UPDATE ${socialRegistrationTable()}
              SET email_code_hash = NULL,
                  email_code_expires_at = NULL,
                  updated_at = $2
            WHERE id = $1`,
          [attempt.id, input.now],
        );
        return { error: "email_code_expired" as const };
      }
      if (attempt.emailCodeHash !== input.expectedCodeHash) {
        const failedAttempts = attempt.emailCodeAttempts + 1;
        await client.query(
          `UPDATE ${socialRegistrationTable()}
              SET email_code_attempts = $2::integer,
                  email_code_hash = CASE
                    WHEN $2::integer >= $3::integer THEN NULL
                    ELSE email_code_hash END,
                  email_code_expires_at = CASE
                    WHEN $2::integer >= $3::integer THEN NULL
                    ELSE email_code_expires_at END,
                  updated_at = $4::timestamptz
            WHERE id = $1`,
          [attempt.id, failedAttempts, input.maxAttempts, input.now],
        );
        return {
          error: failedAttempts >= input.maxAttempts
            ? "email_attempts_exhausted" as const
            : "email_code_invalid" as const,
        };
      }

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
        [attempt.selectedEmail],
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE ${socialRegistrationTable()}
              SET email_code_hash = NULL,
                  email_code_expires_at = NULL,
                  updated_at = $2
            WHERE id = $1`,
          [attempt.id, input.now],
        );
        return { error: "email_conflict" as const };
      }

      await client.query(
        `UPDATE ${socialRegistrationTable()}
            SET state = 'email_verified',
                email_code_hash = NULL,
                email_code_expires_at = NULL,
                updated_at = $2
          WHERE id = $1`,
        [attempt.id, input.now],
      );
      return { error: null, email: attempt.selectedEmail };
    },
  );
  if (outcome.error) throw new SocialRegistrationError(outcome.error);
  return { email: outcome.email };
}

export async function lockSocialRegistrationAttempt(
  transaction: DatabaseTransaction,
  input: { rawToken: string; now: Date },
): Promise<SocialRegistrationAttempt> {
  const [attempt] = await transaction.select()
    .from(socialRegistrationAttempts)
    .where(eq(
      socialRegistrationAttempts.tokenHash,
      intentDigest(input.rawToken),
    ))
    .for("update")
    .limit(1);
  if (!attempt) throw new SocialRegistrationError("intent_invalid");
  if (attempt.expiresAt <= input.now) {
    await transaction.update(socialRegistrationAttempts).set({
      state: "expired",
      consumedAt: input.now,
      updatedAt: input.now,
    }).where(eq(socialRegistrationAttempts.id, attempt.id));
    throw new SocialRegistrationError("intent_expired");
  }
  return attempt;
}

export async function lockSocialRegistrationAttemptForUpdate(
  client: PoolClient,
  input: { rawToken: string; now: Date },
) {
  const result = await client.query<{
    avatarUrl: string | null;
    displayName: string | null;
    expiresAt: Date;
    id: string;
    providerAccountId: string | null;
    providerEmail: string | null;
    providerEmailVerified: boolean;
    providerId: string;
    selectedEmail: string | null;
    state: SocialRegistrationAttempt["state"];
  }>(
    `SELECT id,
            provider_id AS "providerId",
            provider_account_id AS "providerAccountId",
            provider_email AS "providerEmail",
            provider_email_verified AS "providerEmailVerified",
            selected_email AS "selectedEmail",
            display_name AS "displayName",
            avatar_url AS "avatarUrl",
            state,
            expires_at AS "expiresAt"
       FROM ${socialRegistrationTable()}
      WHERE token_hash = $1
      FOR UPDATE`,
    [intentDigest(input.rawToken)],
  );
  const attempt = result.rows[0];
  if (!attempt) throw new SocialRegistrationError("intent_invalid");
  if (attempt.expiresAt <= input.now) {
    throw new SocialRegistrationError("intent_expired");
  }
  return attempt;
}

export async function consumeLockedSocialRegistrationAttempt(
  client: PoolClient,
  input: { attemptId: string; now: Date },
) {
  const result = await client.query(
    `UPDATE ${socialRegistrationTable()}
        SET state = 'completed',
            consumed_at = $2,
            email_code_hash = NULL,
            email_code_expires_at = NULL,
            updated_at = $2
      WHERE id = $1
        AND state IN ('profile_captured', 'email_verified')
        AND consumed_at IS NULL`,
    [input.attemptId, input.now],
  );
  if (result.rowCount !== 1) {
    throw new SocialRegistrationError("intent_invalid");
  }
}
