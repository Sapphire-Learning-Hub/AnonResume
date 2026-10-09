import {
  createHash,
  createHmac,
  randomBytes as secureRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import { readBootstrapConfig } from "@/lib/config/bootstrap";

export type AccountMergeTokenKind =
  | "link-attempt"
  | "link-result-proof"
  | "operation-status"
  | "session-binding";

type TokenOptions = {
  secret?: string;
  randomBytes?: (size: number) => Buffer;
};

function accountMergeSecret(explicit?: string) {
  return explicit ?? readBootstrapConfig().authSecret;
}

function keyedDigest(namespace: string, value: string, secret?: string) {
  return createHmac("sha256", accountMergeSecret(secret))
    .update(`${namespace}\0${value}`, "utf8")
    .digest("hex");
}

export function hashAccountMergeToken(
  kind: AccountMergeTokenKind,
  rawToken: string,
  secret?: string,
) {
  return keyedDigest(`account-merge-token:${kind}`, rawToken, secret);
}

export function createAccountMergeToken(
  kind: AccountMergeTokenKind,
  options: TokenOptions = {},
) {
  const raw = (options.randomBytes ?? secureRandomBytes)(32)
    .toString("base64url");
  return {
    raw,
    digest: hashAccountMergeToken(kind, raw, options.secret),
  };
}

export function verifyAccountMergeToken(
  kind: AccountMergeTokenKind,
  rawToken: string,
  expectedDigest: string,
  secret?: string,
) {
  const actual = Buffer.from(
    hashAccountMergeToken(kind, rawToken, secret),
    "hex",
  );
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeAccountMergeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function digestAccountMergeEmail(email: string, secret?: string) {
  return keyedDigest(
    "account-merge-email",
    normalizeAccountMergeEmail(email),
    secret,
  );
}

export function maskAccountMergeEmail(email: string) {
  const normalized = normalizeAccountMergeEmail(email);
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return "***";
  return `${normalized[0]}***@${normalized.slice(separator + 1)}`;
}

export function createMergedAccountEmail(userId: string) {
  const normalized = userId.trim().toLowerCase();
  if (/^[a-z0-9._-]{1,64}$/.test(normalized)) {
    return `merged+${normalized}@users.invalid`;
  }

  const stem = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user";
  const suffix = createHash("sha256").update(userId, "utf8").digest("hex")
    .slice(0, 12);
  return `merged+${stem}-${suffix}@users.invalid`;
}
