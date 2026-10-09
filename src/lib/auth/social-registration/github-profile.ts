import { github } from "better-auth/social-providers";
import { cookies } from "next/headers";

import {
  captureSocialLinkProviderSubject,
  SOCIAL_LINK_ATTEMPT_COOKIE,
} from "@/lib/auth/account/merge/link-attempts";

import {
  captureSocialRegistrationProfile,
  SOCIAL_REGISTRATION_ATTEMPT_COOKIE,
} from "./repository";

type GitHubProvider = ReturnType<typeof github>;
type GitHubTokens = Parameters<GitHubProvider["getUserInfo"]>[0];

export async function getGitHubUserInfoForAuth(
  tokens: GitHubTokens,
  options: { clientId: string; clientSecret: string },
) {
  const result = await github(options).getUserInfo(tokens);
  if (!result) return null;

  const cookieStore = await cookies();
  const providerAccountId = result.data.id;
  const captures: Promise<unknown>[] = [];
  const linkToken = cookieStore.get(SOCIAL_LINK_ATTEMPT_COOKIE)?.value;
  if (linkToken) {
    captures.push(captureSocialLinkProviderSubject({
      providerAccountId,
      providerId: "github",
      rawToken: linkToken,
    }));
  }

  const registrationToken = cookieStore.get(
    SOCIAL_REGISTRATION_ATTEMPT_COOKIE,
  )?.value;
  if (registrationToken) {
    captures.push(captureSocialRegistrationProfile({
      rawToken: registrationToken,
      providerId: "github",
      providerAccountId,
      providerEmail: typeof result.user.email === "string"
        ? result.user.email
        : null,
      providerEmailVerified: result.user.emailVerified === true,
      displayName: typeof result.user.name === "string"
        ? result.user.name
        : result.data.login,
      avatarUrl: typeof result.user.image === "string"
        ? result.user.image
        : null,
    }));
  }

  // Capture is advisory to Better Auth. The product result route validates that
  // it succeeded before allowing the registration flow to continue.
  await Promise.allSettled(captures);
  return result;
}
