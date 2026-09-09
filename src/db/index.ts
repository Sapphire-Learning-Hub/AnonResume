import { drizzle } from "drizzle-orm/node-postgres";

import { getDatabasePool } from "@/lib/database";

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
