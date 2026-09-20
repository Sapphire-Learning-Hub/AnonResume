import { eq } from "drizzle-orm";

import {
  db,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
} from "@/db";
import {
  claimInstanceSetupCode,
  inspectPublicSetupStatus,
  requireInstanceSetupSession,
  SetupClaimRateLimitError,
  SetupCodeInvalidError,
  SetupSessionInvalidError,
} from "@/lib/admin/setup/session";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";

describe("instance setup sessions", () => {
  beforeEach(async () => {
    await db.delete(instanceSetupClaimLimits);
    await db.delete(instanceSetupSessions);
    await db.delete(instanceSetupTokens);
    await db.delete(instanceSetupState);
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "pending_initialization",
    });
  });

  it("exposes only the public setup mode", async () => {
    await expect(inspectPublicSetupStatus()).resolves.toEqual({
      required: true,
      mode: "initialization",
    });
    await db
      .update(instanceSetupState)
      .set({ state: "pending_admin_recovery", targetUserId: "owner" })
      .where(eq(instanceSetupState.slot, 1));
    await expect(inspectPublicSetupStatus()).resolves.toEqual({
      required: true,
      mode: "recovery",
    });
  });

  it("returns the same error for unknown and expired codes", async () => {
    const issued = await issueCode("web-1");
    await db
      .update(instanceSetupTokens)
      .set({ expiresAt: new Date(0) })
      .where(eq(instanceSetupTokens.generation, issued.generation));

    const errors = await Promise.all([
      captureClaimError(issued.rawCode, "expired-source"),
      captureClaimError("unknown-code", "unknown-source"),
    ]);

    expect(errors).toEqual([
      expect.objectContaining({ code: "setup_code_invalid" }),
      expect.objectContaining({ code: "setup_code_invalid" }),
    ]);
    expect(errors[0]).toBeInstanceOf(SetupCodeInvalidError);
    expect(errors[1]).toBeInstanceOf(SetupCodeInvalidError);
  });

  it("creates a hashed cookie session and rejects code reuse", async () => {
    const issued = await issueCode("web-1");
    const claimed = await claimInstanceSetupCode(issued.rawCode, "client-1");

    expect(claimed.rawSessionToken).toEqual(expect.any(String));
    expect(JSON.stringify(await db.select().from(instanceSetupSessions))).not.toContain(
      claimed.rawSessionToken,
    );
    await expect(
      requireInstanceSetupSession(
        requestWithSession(claimed.rawSessionToken),
      ),
    ).resolves.toMatchObject({
      mode: "initialization",
      generation: issued.generation,
      targetUserId: null,
    });
    await expect(
      claimInstanceSetupCode(issued.rawCode, "client-2"),
    ).rejects.toBeInstanceOf(SetupCodeInvalidError);
  });

  it("invalidates a claimed session when the same instance restarts", async () => {
    const issued = await issueCode("web-1");
    const claimed = await claimInstanceSetupCode(issued.rawCode, "client-1");

    await issueCode("web-1");

    await expect(
      requireInstanceSetupSession(
        requestWithSession(claimed.rawSessionToken),
      ),
    ).rejects.toBeInstanceOf(SetupSessionInvalidError);
  });

  it("does not invalidate a session when another replica starts", async () => {
    const issued = await issueCode("web-1");
    const claimed = await claimInstanceSetupCode(issued.rawCode, "client-1");

    await issueCode("web-2");

    await expect(
      requireInstanceSetupSession(
        requestWithSession(claimed.rawSessionToken),
      ),
    ).resolves.toMatchObject({ generation: issued.generation });
  });

  it("rate-limits the sixth failed claim without changing setup state", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        claimInstanceSetupCode("invalid", "repeated-source"),
      ).rejects.toBeInstanceOf(SetupCodeInvalidError);
    }

    await expect(
      claimInstanceSetupCode("invalid", "repeated-source"),
    ).rejects.toBeInstanceOf(SetupClaimRateLimitError);
    await expect(inspectPublicSetupStatus()).resolves.toEqual({
      required: true,
      mode: "initialization",
    });
  });
});

async function issueCode(instanceId: string) {
  const result = await initializePendingInstanceSetup({
    identity: { stableId: `production/web/${instanceId}` },
  });
  if (!result.generated) throw new Error("setup code was not generated");
  return result;
}

async function captureClaimError(code: string, source: string) {
  try {
    await claimInstanceSetupCode(code, source);
    throw new Error("claim unexpectedly succeeded");
  } catch (error) {
    return error;
  }
}

function requestWithSession(rawSessionToken: string) {
  return new Request("http://localhost/setup", {
    headers: { cookie: `anonresume.setup=${rawSessionToken}` },
  });
}
