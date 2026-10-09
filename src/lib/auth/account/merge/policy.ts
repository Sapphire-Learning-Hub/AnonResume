import { AccountMergeError } from "./errors";
import type {
  AccountMergeAccountFacts,
  AccountMergePolicyResult,
  AccountMergePrimaryChoice,
  AccountMergeProviderIdentity,
} from "./types";

export type AccountMergePolicyInput = {
  current: AccountMergeAccountFacts;
  target: AccountMergeAccountFacts;
  provider: AccountMergeProviderIdentity;
  requestedPrimary?: AccountMergePrimaryChoice;
};

function isAdministrator(account: AccountMergeAccountFacts) {
  return account.adminKind === "super_admin" ||
    account.adminKind === "delegated_admin";
}

function assertEligible(account: AccountMergeAccountFacts) {
  if (
    account.lifecycleStatus !== "active" ||
    account.suspended ||
    account.adminKind === "quarantined_admin"
  ) {
    throw new AccountMergeError("account_unavailable");
  }
  if (!account.hasPassword) {
    throw new AccountMergeError("password_unavailable");
  }
}

function ownsProviderIdentity(
  account: AccountMergeAccountFacts,
  provider: AccountMergeProviderIdentity,
) {
  return account.providerAccounts.some((identity) =>
    identity.providerId === provider.providerId &&
    identity.accountId === provider.accountId
  );
}

function hasProviderConflict(
  account: AccountMergeAccountFacts,
  provider: AccountMergeProviderIdentity,
) {
  return account.providerAccounts.some((identity) =>
    identity.providerId === provider.providerId &&
    identity.accountId !== provider.accountId
  );
}

export function evaluateAccountMergePolicy(
  input: AccountMergePolicyInput,
): AccountMergePolicyResult {
  if (input.current.userId === input.target.userId) {
    throw new AccountMergeError("same_account");
  }
  assertEligible(input.current);
  assertEligible(input.target);

  if (!ownsProviderIdentity(input.target, input.provider)) {
    throw new AccountMergeError("provider_ownership_changed");
  }

  const currentIsAdmin = isAdministrator(input.current);
  const targetIsAdmin = isAdministrator(input.target);
  if (currentIsAdmin && targetIsAdmin) {
    throw new AccountMergeError("administrator_pair");
  }
  if (targetIsAdmin) {
    throw new AccountMergeError("target_is_administrator");
  }

  const candidates: AccountMergePrimaryChoice[] = currentIsAdmin
    ? ["current"]
    : ["current", "target"];
  const allowedPrimaryChoices = candidates.filter((choice) => {
    const account = choice === "current" ? input.current : input.target;
    return !hasProviderConflict(account, input.provider);
  });

  if (allowedPrimaryChoices.length === 0) {
    throw new AccountMergeError("provider_conflict");
  }

  const defaultPrimaryChoice = allowedPrimaryChoices.includes("current")
    ? "current"
    : allowedPrimaryChoices[0]!;
  const selectedPrimaryChoice = input.requestedPrimary ?? defaultPrimaryChoice;
  if (!allowedPrimaryChoices.includes(selectedPrimaryChoice)) {
    if (hasProviderConflict(
      selectedPrimaryChoice === "current" ? input.current : input.target,
      input.provider,
    )) {
      throw new AccountMergeError("provider_conflict");
    }
    throw new AccountMergeError(
      currentIsAdmin
        ? "administrator_must_be_primary"
        : "primary_choice_invalid",
    );
  }

  return {
    allowedPrimaryChoices,
    defaultPrimaryChoice,
    selectedPrimaryChoice,
    requiresAdminMfa: currentIsAdmin,
  };
}
