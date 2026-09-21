import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt, lte } from "drizzle-orm";

import {
  db,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupTokens,
} from "@/db";
import {
  generateAdminSessionToken,
  hashAdminSecret,
} from "@/lib/admin/crypto";
import {
  getInstanceSetupSnapshot,
  withInstanceSetupLock,
} from "@/lib/admin/setup/repository";
import {
  SETUP_SESSION_COOKIE,
  SETUP_SESSION_MAX_AGE_SECONDS,
} from "@/lib/admin/setup/request";
import { readBootstrapConfig } from "@/lib/config/bootstrap";

const CLAIM_WINDOW_MS = 60 * 1_000;
const CLAIM_FAILURE_LIMIT = 5;

export interface SetupSessionContext {
  sessionId: string;
  generation: string;
  expiresAt: Date;
  mode: "initialization" | "recovery";
  targetUserId: string | null;
}

export class SetupCodeInvalidError extends Error {
  readonly code = "setup_code_invalid";

  constructor() {
    super("setup_code_invalid");
    this.name = "SetupCodeInvalidError";
  }
}

export class SetupClaimRateLimitError extends Error {
  readonly code = "setup_claim_rate_limited";
  readonly retryAfterSeconds = 60;

  constructor() {
    super("setup_claim_rate_limited");
    this.name = "SetupClaimRateLimitError";
  }
}

export class SetupSessionInvalidError extends Error {
  readonly code = "setup_session_invalid";

  constructor() {
    super("setup_session_invalid");
    this.name = "SetupSessionInvalidError";
  }
}

export async function inspectPublicSetupStatus() {
  const snapshot = await getInstanceSetupSnapshot();
  if (snapshot.state === "completed") {
    return { required: false } as const;
  }

  return {
    required: true,
    mode: snapshot.state === "pending_initialization"
      ? "initialization" as const
      : "recovery" as const,
  };
}

export async function claimInstanceSetupCode(
  rawCode: string,
  requestSource: string,
) {
  const now = new Date();
  const sourceHash = hashRequestSource(requestSource);
  const claimResult = await withInstanceSetupLock(async (transaction) => {
    const snapshot = await getInstanceSetupSnapshot(transaction);
    if (snapshot.state === "completed") {
      return { outcome: "invalid" } as const;
    }

    const [claimLimit] = await transaction
      .select()
      .from(instanceSetupClaimLimits)
      .where(eq(instanceSetupClaimLimits.sourceHash, sourceHash))
      .limit(1);
    if (
      claimLimit &&
      claimLimit.expiresAt > now &&
      claimLimit.failedAttempts >= CLAIM_FAILURE_LIMIT
    ) {
      return { outcome: "rate_limited" } as const;
    }

    await transaction
      .delete(instanceSetupClaimLimits)
      .where(lte(instanceSetupClaimLimits.expiresAt, now));
    await transaction
      .delete(instanceSetupSessions)
      .where(lte(instanceSetupSessions.expiresAt, now));

    const candidateHash = hashAdminSecret(rawCode);
    const activeTokens = await transaction
      .select({
        id: instanceSetupTokens.id,
        generation: instanceSetupTokens.generation,
        tokenHash: instanceSetupTokens.tokenHash,
      })
      .from(instanceSetupTokens)
      .where(gt(instanceSetupTokens.expiresAt, now));
    let matched: (typeof activeTokens)[number] | undefined;
    for (const token of activeTokens) {
      if (safeHashEqual(candidateHash, token.tokenHash)) {
        matched = token;
      }
    }

    if (!matched) {
      const expiresAt = new Date(now.getTime() + CLAIM_WINDOW_MS);
      await transaction
        .insert(instanceSetupClaimLimits)
        .values({
          sourceHash,
          failedAttempts: 1,
          windowStartedAt: now,
          expiresAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: instanceSetupClaimLimits.sourceHash,
          set: claimLimit && claimLimit.expiresAt > now
            ? {
                failedAttempts: claimLimit.failedAttempts + 1,
                updatedAt: now,
              }
            : {
                failedAttempts: 1,
                windowStartedAt: now,
                expiresAt,
                updatedAt: now,
              },
        });
      return { outcome: "invalid" } as const;
    }

    await transaction
      .delete(instanceSetupClaimLimits)
      .where(eq(instanceSetupClaimLimits.sourceHash, sourceHash));
    const session = generateAdminSessionToken();
    const expiresAt = new Date(
      now.getTime() + SETUP_SESSION_MAX_AGE_SECONDS * 1_000,
    );
    const [created] = await transaction
      .insert(instanceSetupSessions)
      .values({
        tokenHash: session.tokenHash,
        generation: matched.generation,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: instanceSetupSessions.id });
    await transaction
      .update(instanceSetupTokens)
      .set({
        tokenHash: hashAdminSecret(randomBytes(32).toString("base64url")),
      })
      .where(eq(instanceSetupTokens.id, matched.id));

    return {
      outcome: "claimed",
      rawSessionToken: session.rawToken,
      expiresAt,
      sessionId: created!.id,
      mode: snapshot.state === "pending_initialization"
        ? "initialization" as const
        : "recovery" as const,
    } as const;
  });

  if (claimResult.outcome === "rate_limited") {
    throw new SetupClaimRateLimitError();
  }
  if (claimResult.outcome === "invalid") {
    throw new SetupCodeInvalidError();
  }

  return {
    rawSessionToken: claimResult.rawSessionToken,
    expiresAt: claimResult.expiresAt,
    mode: claimResult.mode,
  };
}

export async function requireInstanceSetupSession(
  request: Request,
): Promise<SetupSessionContext> {
  const rawSessionToken = readCookie(
    request.headers.get("cookie"),
    SETUP_SESSION_COOKIE,
  );
  if (!rawSessionToken) throw new SetupSessionInvalidError();

  const snapshot = await getInstanceSetupSnapshot();
  if (snapshot.state === "completed") throw new SetupSessionInvalidError();

  const now = new Date();
  const [session] = await db
    .select({
      sessionId: instanceSetupSessions.id,
      generation: instanceSetupSessions.generation,
      expiresAt: instanceSetupSessions.expiresAt,
    })
    .from(instanceSetupSessions)
    .innerJoin(
      instanceSetupTokens,
      eq(instanceSetupTokens.generation, instanceSetupSessions.generation),
    )
    .where(
      and(
        eq(instanceSetupSessions.tokenHash, hashAdminSecret(rawSessionToken)),
        gt(instanceSetupSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!session) throw new SetupSessionInvalidError();

  return {
    ...session,
    mode: snapshot.state === "pending_initialization"
      ? "initialization"
      : "recovery",
    targetUserId: snapshot.targetUserId,
  };
}

function hashRequestSource(source: string) {
  return createHmac("sha256", readBootstrapConfig().currentMasterKey)
    .update(source, "utf8")
    .digest("hex");
}

function safeHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}
