import { drizzle } from "drizzle-orm/node-postgres";

import { getDatabasePool } from "@/lib/runtime/database";

import { aiDatabaseTables } from "./ai-schema";
import { accountMergeDatabaseTables } from "./account-merge-schema";
import { configDatabaseTables } from "./config-schema";
import { invitationDatabaseTables } from "./invitation-schema";
import { socialRegistrationDatabaseTables } from "./social-registration-schema";

import {
  accountEmailChallenges,
  accountLifecycle,
  accountRestrictions,
  adminActivationTokens,
  adminAssignments,
  adminAuditEvents,
  adminMfaDevices,
  adminMfaResetRequests,
  adminPrincipals,
  adminRecoveryCodes,
  adminRoles,
  adminSecurityStates,
  adminSessions,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
  onboardingRuns,
  pdfExportJobs,
  resumes,
  resumeVersions,
  workerHeartbeats,
} from "./schema";

export { getDatabaseSchemaName } from "./schema";
export {
  accountMergeLocks,
  accountMergeNotificationOutbox,
  accountMergeOperations,
  accountSocialLinkAttempts,
} from "./account-merge-schema";
export {
  aiAuditPayloads,
  aiConversations,
  aiMessages,
  aiModelRateVersions,
  aiModels,
  aiProposals,
  aiProviderCredentials,
  aiQuotaAccounts,
  aiRuns,
  aiUsageLedger,
} from "./ai-schema";
export {
  systemConfigRevisions,
  systemConfigRuntimeStates,
  systemConfigValues,
} from "./config-schema";
export { userInvitations } from "./invitation-schema";
export {
  socialRegistrationAttempts,
  type SocialRegistrationAttemptState,
} from "./social-registration-schema";
export {
  accountEmailChallenges,
  accountLifecycle,
  accountRestrictions,
  adminActivationTokens,
  adminAssignments,
  adminAuditEvents,
  adminMfaDevices,
  adminMfaResetRequests,
  adminPrincipals,
  adminRecoveryCodes,
  adminRoles,
  adminSecurityStates,
  adminSessions,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
  onboardingRuns,
  pdfExportJobs,
  resumes,
  resumeVersions,
  workerHeartbeats,
} from "./schema";

export const db = drizzle({
  client: getDatabasePool(),
  schema: {
    ...accountMergeDatabaseTables,
    ...aiDatabaseTables,
    ...configDatabaseTables,
    ...invitationDatabaseTables,
    ...socialRegistrationDatabaseTables,
    accountEmailChallenges,
    accountLifecycle,
    accountRestrictions,
    onboardingRuns,
    resumes,
    resumeVersions,
    pdfExportJobs,
    adminPrincipals,
    adminRoles,
    adminAssignments,
    adminMfaDevices,
    adminMfaResetRequests,
    adminRecoveryCodes,
    adminSecurityStates,
    adminSessions,
    adminActivationTokens,
    adminAuditEvents,
    instanceSetupState,
    instanceSetupTokens,
    instanceSetupSessions,
    instanceSetupClaimLimits,
    workerHeartbeats,
  },
});
