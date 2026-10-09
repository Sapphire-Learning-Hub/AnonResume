import { and, eq, gt, inArray, lte } from "drizzle-orm";

import { db, socialRegistrationAttempts } from "@/db";
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

function normalizeOptionalEmail(email: string | null) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function intentDigest(rawToken: string) {
  return hashSocialRegistrationToken("intent", rawToken);
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
