import { socialRegistrationAttempts, db } from "@/db";
import { SocialRegistrationError } from "@/lib/auth/social-registration/errors";
import {
  captureSocialRegistrationProfile,
  consumeSocialRegistrationAttempt,
  createSocialRegistrationAttempt,
  inspectSocialRegistrationIntent,
} from "@/lib/auth/social-registration/repository";
import { hashSocialRegistrationToken } from "@/lib/auth/social-registration/tokens";

describe("social registration intent store", () => {
  afterEach(async () => {
    await db.delete(socialRegistrationAttempts);
  });

  it("stores only a purpose-separated digest of the browser token", async () => {
    const now = new Date("2026-10-10T00:00:00.000Z");
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });

    const [stored] = await db.select().from(socialRegistrationAttempts);

    expect(stored).toMatchObject({
      providerId: "github",
      state: "started",
      tokenHash: hashSocialRegistrationToken("intent", attempt.rawToken),
      expiresAt: new Date("2026-10-10T00:15:00.000Z"),
    });
    expect(stored?.tokenHash).not.toBe(attempt.rawToken);
  });

  it("captures a provider profile only for an unexpired started intent", async () => {
    const now = new Date("2026-10-10T01:00:00.000Z");
    const active = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });
    const expired = await createSocialRegistrationAttempt({
      providerId: "github",
      now: new Date(now.getTime() - 16 * 60_000),
    });

    await expect(captureSocialRegistrationProfile({
      rawToken: active.rawToken,
      providerId: "github",
      providerAccountId: "github-active",
      providerEmail: "Active@Example.com",
      providerEmailVerified: true,
      displayName: "Active User",
      avatarUrl: "https://avatars.example/active",
      now,
    })).resolves.toBe(true);
    await expect(captureSocialRegistrationProfile({
      rawToken: expired.rawToken,
      providerId: "github",
      providerAccountId: "github-expired",
      providerEmail: "expired@example.com",
      providerEmailVerified: true,
      displayName: "Expired User",
      avatarUrl: null,
      now,
    })).resolves.toBe(false);

    await expect(inspectSocialRegistrationIntent({
      rawToken: active.rawToken,
      now,
    })).resolves.toEqual({
      state: "password",
      displayName: "Active User",
      imageUrl: "https://avatars.example/active",
      email: "active@example.com",
    });

    const stored = await db.select().from(socialRegistrationAttempts);
    expect(stored.find((row) => row.providerAccountId === "github-active"))
      .toMatchObject({
        providerEmail: "active@example.com",
        providerEmailVerified: true,
        selectedEmail: "active@example.com",
        state: "profile_captured",
      });
    expect(stored.find((row) => row.tokenHash === hashSocialRegistrationToken(
      "intent",
      expired.rawToken,
    ))).toMatchObject({
      providerAccountId: null,
      providerEmail: null,
      state: "started",
    });
  });

  it("keeps an unverified provider email separate from the final email", async () => {
    const now = new Date("2026-10-10T02:00:00.000Z");
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });

    await captureSocialRegistrationProfile({
      rawToken: attempt.rawToken,
      providerId: "github",
      providerAccountId: "github-unverified",
      providerEmail: "Unverified@Example.com",
      providerEmailVerified: false,
      displayName: "Unverified User",
      avatarUrl: null,
      now,
    });

    const [stored] = await db.select().from(socialRegistrationAttempts);
    expect(stored).toMatchObject({
      providerEmail: "unverified@example.com",
      providerEmailVerified: false,
      selectedEmail: null,
      state: "email_pending",
    });
    await expect(inspectSocialRegistrationIntent({
      rawToken: attempt.rawToken,
      now,
    })).resolves.toEqual({
      state: "email",
      displayName: "Unverified User",
      imageUrl: null,
      email: null,
    });
  });

  it("expires stale intents and refuses to inspect them", async () => {
    const createdAt = new Date("2026-10-10T03:00:00.000Z");
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now: createdAt,
    });
    const now = new Date("2026-10-10T03:15:00.000Z");

    await expect(inspectSocialRegistrationIntent({
      rawToken: attempt.rawToken,
      now,
    })).rejects.toEqual(expect.objectContaining({ code: "intent_expired" }));

    const [stored] = await db.select().from(socialRegistrationAttempts);
    expect(stored).toMatchObject({ state: "expired", consumedAt: now });
  });

  it("consumes an intent exactly once and hides completed records", async () => {
    const now = new Date("2026-10-10T04:00:00.000Z");
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });
    await captureSocialRegistrationProfile({
      rawToken: attempt.rawToken,
      providerId: "github",
      providerAccountId: "github-consumed",
      providerEmail: "consumed@example.com",
      providerEmailVerified: true,
      displayName: "Consumed User",
      avatarUrl: null,
      now,
    });

    await expect(consumeSocialRegistrationAttempt({
      rawToken: attempt.rawToken,
      now,
    })).resolves.toBe(true);
    await expect(consumeSocialRegistrationAttempt({
      rawToken: attempt.rawToken,
      now,
    })).resolves.toBe(false);
    await expect(inspectSocialRegistrationIntent({
      rawToken: attempt.rawToken,
      now,
    })).rejects.toBeInstanceOf(SocialRegistrationError);
  });
});
