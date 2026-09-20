import { randomBytes, randomUUID } from "node:crypto";

import { eq, lte } from "drizzle-orm";

import {
  instanceSetupSessions,
  instanceSetupTokens,
} from "@/db";
import { hashAdminSecret } from "@/lib/admin/crypto";
import {
  getInstanceSetupSnapshot,
  withInstanceSetupLock,
} from "@/lib/admin/setup/repository";
import type { InstanceSetupState } from "@/lib/admin/setup/types";
import {
  resolveRuntimeIdentity,
  type RuntimeIdentity,
} from "@/lib/runtime/instance-identity";

const SETUP_CODE_TTL_MS = 30 * 60 * 1_000;

export type SetupStartupResult =
  | {
      state: "completed";
      generated: false;
    }
  | {
      state: Exclude<InstanceSetupState, "completed">;
      generated: true;
      rawCode: string;
      generation: string;
      expiresAt: Date;
    };

interface SetupStartupInput {
  identity?: Pick<RuntimeIdentity, "stableId">;
  now?: Date;
}

export async function initializePendingInstanceSetup(
  input: SetupStartupInput = {},
): Promise<SetupStartupResult> {
  const identity = input.identity ?? resolveRuntimeIdentity("web");
  const now = input.now ?? new Date();

  return withInstanceSetupLock(async (transaction) => {
    const snapshot = await getInstanceSetupSnapshot(transaction);
    if (snapshot.state === "completed") {
      return { state: "completed", generated: false };
    }

    const [previousToken] = await transaction
      .select({ generation: instanceSetupTokens.generation })
      .from(instanceSetupTokens)
      .where(eq(instanceSetupTokens.sourceInstanceId, identity.stableId))
      .limit(1);
    if (previousToken) {
      await transaction
        .delete(instanceSetupSessions)
        .where(eq(instanceSetupSessions.generation, previousToken.generation));
    }

    await transaction
      .delete(instanceSetupSessions)
      .where(lte(instanceSetupSessions.expiresAt, now));
    await transaction
      .delete(instanceSetupTokens)
      .where(lte(instanceSetupTokens.expiresAt, now));

    const rawCode = randomBytes(32).toString("base64url");
    const generation = randomUUID();
    const expiresAt = new Date(now.getTime() + SETUP_CODE_TTL_MS);
    await transaction
      .insert(instanceSetupTokens)
      .values({
        sourceInstanceId: identity.stableId,
        generation,
        tokenHash: hashAdminSecret(rawCode),
        expiresAt,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: instanceSetupTokens.sourceInstanceId,
        set: {
          generation,
          tokenHash: hashAdminSecret(rawCode),
          expiresAt,
          createdAt: now,
        },
      });

    return {
      state: snapshot.state,
      generated: true,
      rawCode,
      generation,
      expiresAt,
    };
  });
}
