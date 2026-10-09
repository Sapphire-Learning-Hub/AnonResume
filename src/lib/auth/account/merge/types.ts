import type { AdminPrincipalKind } from "@/db/schema";
import type { AccountLifecycleStatus } from "@/lib/auth/account/types";

export type AccountMergePrimaryChoice = "current" | "target";

export type AccountMergeProviderIdentity = {
  providerId: string;
  accountId: string;
};

export type AccountMergeAccountFacts = {
  userId: string;
  lifecycleStatus: AccountLifecycleStatus;
  suspended: boolean;
  adminKind: AdminPrincipalKind | null;
  hasPassword: boolean;
  providerAccounts: readonly AccountMergeProviderIdentity[];
};

export type AccountMergePolicyResult = {
  allowedPrimaryChoices: readonly AccountMergePrimaryChoice[];
  defaultPrimaryChoice: AccountMergePrimaryChoice;
  selectedPrimaryChoice: AccountMergePrimaryChoice;
  requiresAdminMfa: boolean;
};
