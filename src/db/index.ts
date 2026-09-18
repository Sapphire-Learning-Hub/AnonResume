import { drizzle } from "drizzle-orm/node-postgres";

import { getDatabasePool } from "@/lib/runtime/database";

import { aiDatabaseTables } from "./ai-schema";

import {
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
  pdfExportJobs,
  resumes,
  resumeVersions,
  workerHeartbeats,
} from "./schema";

export { getDatabaseSchemaName } from "./schema";
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
  pdfExportJobs,
  resumes,
  resumeVersions,
  workerHeartbeats,
} from "./schema";

export const db = drizzle({
  client: getDatabasePool(),
  schema: {
    ...aiDatabaseTables,
    accountRestrictions,
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
    workerHeartbeats,
  },
});
