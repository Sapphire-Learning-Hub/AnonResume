import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

import { getDatabasePool } from "@/lib/runtime/database";
import { sendVerificationEmail } from "@/lib/runtime/email";
import { resolveApplicationOriginForBootstrap } from "@/lib/runtime/configuration";

function getBaseUrl() {
  return resolveApplicationOriginForBootstrap(process.env);
}

function getAuthSecret() {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.NODE_ENV !== "production") {
    return "anonresume-development-secret-2026-08-28";
  }

  throw new Error("BETTER_AUTH_SECRET is required");
}

function getEmailVerificationExpiresIn() {
  const rawValue = process.env.EMAIL_VERIFICATION_EXPIRES_SECONDS || "3600";
  const expiresIn = Number(rawValue);

  if (!Number.isInteger(expiresIn) || expiresIn < 300) {
    throw new Error(
      "EMAIL_VERIFICATION_EXPIRES_SECONDS must be an integer of at least 300",
    );
  }

  return expiresIn;
}

function getSocialProviders() {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return undefined;
  }

  return {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  };
}

export function isGitHubAuthEnabled() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export const auth = betterAuth({
  appName: "AnonResume",
  baseURL: getBaseUrl(),
  secret: getAuthSecret(),
  database: getDatabasePool(),
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      after(() =>
        sendVerificationEmail({
          email: user.email,
          name: user.name,
          url,
        }),
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: getEmailVerificationExpiresIn(),
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  rateLimit: {
    enabled: true,
  },
  socialProviders: getSocialProviders(),
  plugins: [nextCookies()],
});
