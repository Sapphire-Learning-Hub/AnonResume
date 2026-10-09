import { randomInt } from "node:crypto";

import { SocialRegistrationError } from "./errors";
import {
  invalidateSocialRegistrationEmailChallenge,
  storeSocialRegistrationEmailChallenge,
  verifyStoredSocialRegistrationEmail,
} from "./repository";
import { hashSocialRegistrationToken } from "./tokens";

const EMAIL_CODE_LIFETIME_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_DELAY_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new SocialRegistrationError("email_invalid");
  }
  return normalized;
}

function createEmailCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function codeHash(rawToken: string, code: string) {
  return hashSocialRegistrationToken(
    "email-code",
    `${rawToken}\0${code}`,
  );
}

export async function sendSocialRegistrationEmailChallenge(
  input: {
    rawToken: string;
    email: string;
    now?: Date;
    deliver: (value: { code: string; expiresAt: Date }) => Promise<void>;
  },
  dependencies: { createCode?: () => string } = {},
) {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const code = dependencies.createCode?.() ?? createEmailCode();
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Social registration code generator returned an invalid code");
  }
  const digest = codeHash(input.rawToken, code);
  const expiresAt = new Date(now.getTime() + EMAIL_CODE_LIFETIME_MS);
  await storeSocialRegistrationEmailChallenge({
    rawToken: input.rawToken,
    email,
    codeHash: digest,
    codeExpiresAt: expiresAt,
    now,
    resendDelayMs: EMAIL_CODE_RESEND_DELAY_MS,
  });

  try {
    await input.deliver({ code, expiresAt });
  } catch (error) {
    await invalidateSocialRegistrationEmailChallenge({
      rawToken: input.rawToken,
      codeHash: digest,
    });
    throw error;
  }

  return {
    retryAfterSeconds: EMAIL_CODE_RESEND_DELAY_MS / 1000,
  };
}

export async function verifySocialRegistrationEmail(input: {
  rawToken: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const digest = /^\d{6}$/.test(input.code)
    ? codeHash(input.rawToken, input.code)
    : codeHash(input.rawToken, "invalid");
  return verifyStoredSocialRegistrationEmail({
    rawToken: input.rawToken,
    expectedCodeHash: digest,
    maxAttempts: EMAIL_CODE_MAX_ATTEMPTS,
    now,
  });
}
