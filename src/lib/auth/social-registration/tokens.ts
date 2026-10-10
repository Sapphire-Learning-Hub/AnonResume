import {
  createHmac,
  randomBytes as secureRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import { readBootstrapConfig } from "@/lib/config/bootstrap";

export type SocialRegistrationTokenKind = "intent" | "email-code";

type TokenOptions = {
  secret?: string;
  randomBytes?: (size: number) => Buffer;
};

function tokenSecret(explicit?: string) {
  return explicit ?? readBootstrapConfig().authSecret;
}

export function hashSocialRegistrationToken(
  kind: SocialRegistrationTokenKind,
  value: string,
  secret?: string,
) {
  return createHmac("sha256", tokenSecret(secret))
    .update(`social-registration:${kind}\0${value}`, "utf8")
    .digest("hex");
}

export function createSocialRegistrationToken(
  kind: SocialRegistrationTokenKind,
  options: TokenOptions = {},
) {
  const raw = (options.randomBytes ?? secureRandomBytes)(32)
    .toString("base64url");
  return {
    raw,
    digest: hashSocialRegistrationToken(kind, raw, options.secret),
  };
}

export function verifySocialRegistrationToken(
  kind: SocialRegistrationTokenKind,
  rawToken: string,
  expectedDigest: string,
  secret?: string,
) {
  const actual = Buffer.from(
    hashSocialRegistrationToken(kind, rawToken, secret),
    "hex",
  );
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
