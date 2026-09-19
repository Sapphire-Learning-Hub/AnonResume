import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { getRuntimeConfig } from "@/lib/config/runtime";
import type { ManagedConfig } from "@/lib/config/registry";
import { getDatabasePool } from "@/lib/runtime/database";
import { sendVerificationEmail } from "@/lib/runtime/email";

function createAuth(configuration: {
  applicationOrigin: string;
  authSecret: string;
  values: Readonly<ManagedConfig>;
}) {
  const { values } = configuration;
  const socialProviders = values.githubClientId && values.githubClientSecret
    ? {
        github: {
          clientId: values.githubClientId,
          clientSecret: values.githubClientSecret,
        },
      }
    : undefined;

  return betterAuth({
    appName: "AnonResume",
    baseURL: configuration.applicationOrigin,
    secret: configuration.authSecret,
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
      expiresIn: values.emailVerificationExpiresSeconds,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    rateLimit: {
      enabled: true,
    },
    socialProviders,
    plugins: [nextCookies()],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
let githubAuthEnabled = false;

declare global {
  var __anonResumeAuthPromise: Promise<AuthInstance> | undefined;
}

async function createAuthFromRuntimeConfig() {
  const bootstrap = readBootstrapConfig();
  const runtime = await getRuntimeConfig("web");
  githubAuthEnabled = Boolean(
    runtime.values.githubClientId && runtime.values.githubClientSecret,
  );
  return createAuth({
    applicationOrigin: bootstrap.applicationOrigin,
    authSecret: bootstrap.authSecret,
    values: runtime.values,
  });
}

export async function getAuth(): Promise<AuthInstance> {
  globalThis.__anonResumeAuthPromise ??= createAuthFromRuntimeConfig();
  return globalThis.__anonResumeAuthPromise;
}

export async function isGitHubAuthEnabled() {
  await getAuth();
  return githubAuthEnabled;
}
