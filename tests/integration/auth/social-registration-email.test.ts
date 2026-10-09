import { randomUUID } from "node:crypto";

import { db, socialRegistrationAttempts } from "@/db";
import {
  sendSocialRegistrationEmailChallenge,
  verifySocialRegistrationEmail,
} from "@/lib/auth/social-registration/email";
import {
  captureSocialRegistrationProfile,
  createSocialRegistrationAttempt,
  inspectSocialRegistrationIntent,
} from "@/lib/auth/social-registration/repository";
import { getDatabasePool } from "@/lib/runtime/database";

describe("social registration email verification", () => {
  const createdUserIds: string[] = [];

  async function createIntent(input: {
    email?: string | null;
    emailVerified?: boolean;
    now?: Date;
  } = {}) {
    const now = input.now ?? new Date("2026-10-10T05:00:00.000Z");
    const attempt = await createSocialRegistrationAttempt({
      providerId: "github",
      now,
    });
    await captureSocialRegistrationProfile({
      rawToken: attempt.rawToken,
      providerId: "github",
      providerAccountId: `github-${randomUUID()}`,
      providerEmail: input.email ?? null,
      providerEmailVerified: input.emailVerified ?? false,
      displayName: "GitHub User",
      avatarUrl: null,
      now,
    });
    return { ...attempt, now };
  }

  afterEach(async () => {
    await db.delete(socialRegistrationAttempts);
    if (createdUserIds.length) {
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [createdUserIds.splice(0)],
      );
    }
  });

  it("normalizes the selected email and stores only a hashed six-digit code", async () => {
    const attempt = await createIntent();
    let deliveredCode = "";

    await expect(sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "  New.User@Example.COM ",
      now: attempt.now,
      deliver: async ({ code }) => {
        deliveredCode = code;
      },
    }, { createCode: () => "123456" })).resolves.toEqual({
      retryAfterSeconds: 60,
    });

    expect(deliveredCode).toBe("123456");
    const [stored] = await db.select().from(socialRegistrationAttempts);
    expect(stored).toMatchObject({
      selectedEmail: "new.user@example.com",
      emailCodeAttempts: 0,
      emailCodeSentAt: attempt.now,
      state: "email_pending",
    });
    expect(stored?.emailCodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.emailCodeHash).not.toContain(deliveredCode);
  });

  it("enforces cooldown and makes an earlier code unusable after resend", async () => {
    const attempt = await createIntent();
    const firstAt = attempt.now;
    await sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "user@example.com",
      now: firstAt,
      deliver: async () => undefined,
    }, { createCode: () => "111111" });

    await expect(sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "user@example.com",
      now: new Date(firstAt.getTime() + 59_999),
      deliver: async () => undefined,
    }, { createCode: () => "222222" })).rejects.toMatchObject({
      code: "email_resend_too_soon",
    });

    const resendAt = new Date(firstAt.getTime() + 60_000);
    await sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "user@example.com",
      now: resendAt,
      deliver: async () => undefined,
    }, { createCode: () => "222222" });
    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "111111",
      now: resendAt,
    })).rejects.toMatchObject({ code: "email_code_invalid" });
    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "222222",
      now: resendAt,
    })).resolves.toEqual({ email: "user@example.com" });
  });

  it("expires a code after ten minutes", async () => {
    const attempt = await createIntent();
    await sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "user@example.com",
      now: attempt.now,
      deliver: async () => undefined,
    }, { createCode: () => "333333" });

    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "333333",
      now: new Date(attempt.now.getTime() + 10 * 60_000),
    })).rejects.toMatchObject({ code: "email_code_expired" });
  });

  it("invalidates the current code after five failed attempts", async () => {
    const attempt = await createIntent();
    await sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "user@example.com",
      now: attempt.now,
      deliver: async () => undefined,
    }, { createCode: () => "444444" });

    for (let index = 1; index <= 5; index += 1) {
      await expect(verifySocialRegistrationEmail({
        rawToken: attempt.rawToken,
        code: "000000",
        now: attempt.now,
      })).rejects.toMatchObject({
        code: index === 5
          ? "email_attempts_exhausted"
          : "email_code_invalid",
      });
    }
    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "444444",
      now: attempt.now,
    })).rejects.toMatchObject({ code: "email_attempts_exhausted" });
  });

  it("reveals an existing account only after the email code is proven", async () => {
    const userId = `social-email-${randomUUID()}`;
    createdUserIds.push(userId);
    await getDatabasePool().query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Existing', 'existing@example.com', true, now(), now())`,
      [userId],
    );
    const attempt = await createIntent();

    await expect(sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "existing@example.com",
      now: attempt.now,
      deliver: async () => undefined,
    }, { createCode: () => "555555" })).resolves.toEqual({
      retryAfterSeconds: 60,
    });
    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "000000",
      now: attempt.now,
    })).rejects.toMatchObject({ code: "email_code_invalid" });
    await expect(verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "555555",
      now: attempt.now,
    })).rejects.toMatchObject({ code: "email_conflict" });
  });

  it("moves a proven new email to the password step", async () => {
    const attempt = await createIntent();
    await sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "verified@example.com",
      now: attempt.now,
      deliver: async () => undefined,
    }, { createCode: () => "666666" });

    await verifySocialRegistrationEmail({
      rawToken: attempt.rawToken,
      code: "666666",
      now: attempt.now,
    });

    await expect(inspectSocialRegistrationIntent({
      rawToken: attempt.rawToken,
      now: attempt.now,
    })).resolves.toMatchObject({
      state: "password",
      email: "verified@example.com",
    });
  });

  it("rejects email challenges when GitHub already supplied a verified email", async () => {
    const attempt = await createIntent({
      email: "provider@example.com",
      emailVerified: true,
    });

    await expect(sendSocialRegistrationEmailChallenge({
      rawToken: attempt.rawToken,
      email: "replacement@example.com",
      now: attempt.now,
      deliver: async () => undefined,
    })).rejects.toMatchObject({ code: "email_not_required" });
  });
});
