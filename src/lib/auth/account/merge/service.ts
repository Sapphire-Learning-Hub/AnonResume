import {
  AdminMfaLockedError,
  AdminMfaVerificationError,
  verifyAdminMfaCode,
} from "@/lib/admin/store";
import { AccountSecurityError } from "@/lib/auth/account/errors";
import { verifyAccountPassword } from "@/lib/auth/account/security";

import { AccountMergeError } from "./errors";
import { advanceAccountMergeOperation } from "./executor";
import { evaluateAccountMergePolicy } from "./policy";
import {
  confirmMergeOperation,
  createVerifiedMergeOperation,
  getCollisionIntent,
  getMergeAccountRecord,
  getMergeOperationByStatusToken,
  getOperationProviderIdentity,
  summarizeMergeAccount,
} from "./repository";
import { normalizeAccountMergeEmail } from "./tokens";
import type { AccountMergePrimaryChoice } from "./types";

export const ACCOUNT_MERGE_STATUS_COOKIE = "anonresume_account_merge_status";
export const ACCOUNT_MERGE_STATUS_MAX_AGE_SECONDS = 15 * 60;

function isAdminKind(kind: string | null) {
  return kind === "super_admin" || kind === "delegated_admin";
}

export async function getAccountMergeIntentMetadata(input: {
  rawIntentToken: string;
  userId: string;
  sessionToken: string;
}) {
  const { attempt } = await getCollisionIntent(input);
  const current = await getMergeAccountRecord(input.userId);
  return {
    providerId: attempt.providerId,
    requiresAdminMfa: isAdminKind(current.adminKind),
  };
}

async function verifyPassword(
  userId: string,
  password: string,
  invalidCode: "current_password_invalid" | "target_credentials_invalid",
) {
  try {
    await verifyAccountPassword({ userId, password });
  } catch (error) {
    if (
      error instanceof AccountSecurityError &&
      error.code === "password_unavailable"
    ) {
      throw new AccountMergeError("password_unavailable");
    }
    throw new AccountMergeError(invalidCode);
  }
}

export async function verifyAccountMergeIntent(input: {
  rawIntentToken: string;
  userId: string;
  sessionToken: string;
  currentPassword: string;
  targetEmail: string;
  targetPassword: string;
  mfaCode?: string;
  locale: "zh-CN" | "en-US";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const { attempt, targetUserId } = await getCollisionIntent({
    rawIntentToken: input.rawIntentToken,
    userId: input.userId,
    sessionToken: input.sessionToken,
    now,
  });
  const [current, target] = await Promise.all([
    getMergeAccountRecord(input.userId),
    getMergeAccountRecord(targetUserId),
  ]);
  const policy = evaluateAccountMergePolicy({
    current,
    target,
    provider: {
      providerId: attempt.providerId,
      accountId: attempt.providerAccountId!,
    },
  });

  await verifyPassword(
    current.userId,
    input.currentPassword,
    "current_password_invalid",
  );
  if (
    normalizeAccountMergeEmail(input.targetEmail) !==
      normalizeAccountMergeEmail(target.email)
  ) {
    throw new AccountMergeError("target_credentials_invalid");
  }
  await verifyPassword(
    target.userId,
    input.targetPassword,
    "target_credentials_invalid",
  );

  if (policy.requiresAdminMfa) {
    if (!input.mfaCode) throw new AccountMergeError("mfa_required");
    try {
      await verifyAdminMfaCode({
        userId: current.userId,
        token: input.mfaCode,
        now,
      });
    } catch (error) {
      if (
        error instanceof AdminMfaVerificationError ||
        error instanceof AdminMfaLockedError
      ) {
        throw new AccountMergeError("mfa_invalid");
      }
      throw error;
    }
  }

  const created = await createVerifiedMergeOperation({
    attemptId: attempt.id,
    initiatingUserId: current.userId,
    targetUserId: target.userId,
    providerId: attempt.providerId,
    providerAccountId: attempt.providerAccountId!,
    locale: input.locale,
    now,
  });
  return {
    rawStatusToken: created.rawStatusToken,
    confirmNotBefore: created.operation.confirmNotBefore,
    allowedPrimaryChoices: policy.allowedPrimaryChoices,
    defaultPrimaryChoice: policy.defaultPrimaryChoice,
    requiresAdminMfa: policy.requiresAdminMfa,
    current: summarizeMergeAccount(current),
    target: summarizeMergeAccount(target),
  };
}

export async function confirmVerifiedAccountMerge(input: {
  rawStatusToken: string;
  userId: string;
  primaryChoice: AccountMergePrimaryChoice;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const operation = await getMergeOperationByStatusToken(input.rawStatusToken);
  if (operation.initiatingUserId !== input.userId) {
    throw new AccountMergeError("operation_invalid");
  }
  if (operation.confirmNotBefore > now) {
    throw new AccountMergeError("confirmation_too_early");
  }
  const provider = await getOperationProviderIdentity(operation.id);
  const [current, target] = await Promise.all([
    getMergeAccountRecord(provider.initiatingUserId),
    getMergeAccountRecord(provider.targetUserId),
  ]);
  const policy = evaluateAccountMergePolicy({
    current,
    target,
    provider: {
      providerId: provider.providerId,
      accountId: provider.providerAccountId,
    },
    requestedPrimary: input.primaryChoice,
  });
  const primary = policy.selectedPrimaryChoice === "current" ? current : target;
  const secondary = policy.selectedPrimaryChoice === "current" ? target : current;
  const confirmed = await confirmMergeOperation({
    operationId: operation.id,
    primaryUserId: primary.userId,
    secondaryUserId: secondary.userId,
    secondaryEmail: secondary.email,
    now,
  });
  if (confirmed.state === "confirmed") {
    return advanceAccountMergeOperation({ operationId: confirmed.id, now });
  }
  return { state: confirmed.state };
}

export async function getAccountMergeOperationStatus(rawStatusToken: string) {
  const operation = await getMergeOperationByStatusToken(rawStatusToken);
  const primary = operation.primaryUserId
    ? await getMergeAccountRecord(operation.primaryUserId).catch(() => null)
    : null;
  return {
    state: operation.state,
    failureCode: operation.failureCode,
    primary: primary
      ? { email: summarizeMergeAccount(primary).email, name: primary.name }
      : null,
  };
}
