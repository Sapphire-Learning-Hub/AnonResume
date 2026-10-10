import { and, eq, gt, inArray } from "drizzle-orm";

import { accountSocialLinkAttempts, db } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { AccountMergeError } from "./errors";
import {
  createAccountMergeToken,
  hashAccountMergeToken,
  verifyAccountMergeToken,
} from "./tokens";

export const SOCIAL_LINK_ATTEMPT_COOKIE = "anonresume_social_link_attempt";
export const SOCIAL_LINK_RESULT_PROOF_COOKIE =
  "anonresume_social_link_result_proof";
export const ACCOUNT_MERGE_INTENT_COOKIE = "anonresume_account_merge_intent";

const SOCIAL_LINK_ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
export const SOCIAL_LINK_ATTEMPT_MAX_AGE_SECONDS =
  SOCIAL_LINK_ATTEMPT_LIFETIME_MS / 1000;

export async function createSocialLinkAttempt(input: {
  userId: string;
  sessionToken: string;
  providerId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = createAccountMergeToken("link-attempt");
  const expiresAt = new Date(now.getTime() + SOCIAL_LINK_ATTEMPT_LIFETIME_MS);

  await db.transaction(async (transaction) => {
    await transaction.update(accountSocialLinkAttempts).set({
      state: "cancelled",
      consumedAt: now,
      updatedAt: now,
    }).where(and(
      eq(accountSocialLinkAttempts.initiatingUserId, input.userId),
      eq(accountSocialLinkAttempts.providerId, input.providerId),
      inArray(accountSocialLinkAttempts.state, [
        "started",
        "captured",
        "collision",
      ]),
    ));
    await transaction.insert(accountSocialLinkAttempts).values({
      initiatingUserId: input.userId,
      sessionBindingHash: hashAccountMergeToken(
        "session-binding",
        input.sessionToken,
      ),
      tokenHash: token.digest,
      providerId: input.providerId,
      state: "started",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { rawToken: token.raw, expiresAt };
}

export async function captureSocialLinkProviderSubject(input: {
  rawToken: string;
  providerId: string;
  providerAccountId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const rows = await db.update(accountSocialLinkAttempts).set({
    providerAccountId: input.providerAccountId,
    state: "captured",
    updatedAt: now,
  }).where(and(
    eq(
      accountSocialLinkAttempts.tokenHash,
      hashAccountMergeToken("link-attempt", input.rawToken),
    ),
    eq(accountSocialLinkAttempts.providerId, input.providerId),
    eq(accountSocialLinkAttempts.state, "started"),
    gt(accountSocialLinkAttempts.expiresAt, now),
  )).returning({ id: accountSocialLinkAttempts.id });
  return rows.length === 1;
}

export function createSocialLinkResultProof(
  rawToken: string,
  errorCode: string,
) {
  return hashAccountMergeToken(
    "link-result-proof",
    `${rawToken}\0${errorCode}`,
  );
}

export function verifySocialLinkResultProof(input: {
  rawToken: string;
  errorCode: string;
  proof: string;
}) {
  return verifyAccountMergeToken(
    "link-result-proof",
    `${input.rawToken}\0${input.errorCode}`,
    input.proof,
  );
}

async function loadValidAttempt(input: {
  rawToken: string;
  userId: string;
  sessionToken: string;
  providerId: string;
  now: Date;
}) {
  const [attempt] = await db.select().from(accountSocialLinkAttempts).where(and(
    eq(
      accountSocialLinkAttempts.tokenHash,
      hashAccountMergeToken("link-attempt", input.rawToken),
    ),
    eq(accountSocialLinkAttempts.initiatingUserId, input.userId),
    eq(accountSocialLinkAttempts.providerId, input.providerId),
  )).limit(1);
  if (!attempt) throw new AccountMergeError("intent_invalid");
  if (attempt.expiresAt <= input.now) {
    await db.update(accountSocialLinkAttempts).set({
      state: "expired",
      consumedAt: input.now,
      updatedAt: input.now,
    }).where(eq(accountSocialLinkAttempts.id, attempt.id));
    throw new AccountMergeError("intent_expired");
  }
  const validSession = verifyAccountMergeToken(
    "session-binding",
    input.sessionToken,
    attempt.sessionBindingHash,
  );
  if (!validSession) throw new AccountMergeError("intent_invalid");
  return attempt;
}

export async function resolveSocialLinkAttempt(input: {
  rawToken: string;
  userId: string;
  sessionToken: string;
  providerId: string;
  outcome: "success" | "error";
  errorCode?: string;
  collisionProofValid?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const attempt = await loadValidAttempt({ ...input, now });

  if (input.outcome === "success") {
    const rows = await db.update(accountSocialLinkAttempts).set({
      state: "consumed",
      consumedAt: now,
      updatedAt: now,
    }).where(and(
      eq(accountSocialLinkAttempts.id, attempt.id),
      inArray(accountSocialLinkAttempts.state, ["started", "captured"]),
    )).returning({ id: accountSocialLinkAttempts.id });
    if (rows.length !== 1) throw new AccountMergeError("intent_invalid");
    return { kind: "linked" as const };
  }

  const isCollision = input.errorCode ===
      "account_already_linked_to_different_user" &&
    input.collisionProofValid === true;
  if (
    isCollision &&
    attempt.state === "captured" &&
    attempt.providerAccountId
  ) {
    const owner = await getDatabasePool().query<{ userId: string }>(
      `SELECT "userId" AS "userId" FROM "account"
        WHERE "providerId" = $1 AND "accountId" = $2
        LIMIT 1`,
      [attempt.providerId, attempt.providerAccountId],
    );
    if (!owner.rows[0] || owner.rows[0].userId === input.userId) {
      throw new AccountMergeError("provider_ownership_changed");
    }

    const intent = createAccountMergeToken("link-attempt");
    const rows = await db.update(accountSocialLinkAttempts).set({
      tokenHash: intent.digest,
      state: "collision",
      updatedAt: now,
    }).where(and(
      eq(accountSocialLinkAttempts.id, attempt.id),
      eq(accountSocialLinkAttempts.state, "captured"),
      eq(accountSocialLinkAttempts.tokenHash, attempt.tokenHash),
    )).returning({ id: accountSocialLinkAttempts.id });
    if (rows.length !== 1) throw new AccountMergeError("intent_invalid");
    return { kind: "collision" as const, rawIntentToken: intent.raw };
  }

  await db.update(accountSocialLinkAttempts).set({
    state: "cancelled",
    consumedAt: now,
    updatedAt: now,
  }).where(and(
    eq(accountSocialLinkAttempts.id, attempt.id),
    inArray(accountSocialLinkAttempts.state, ["started", "captured"]),
  ));
  return { kind: "failed" as const };
}
