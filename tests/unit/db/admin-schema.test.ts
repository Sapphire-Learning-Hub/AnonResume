import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  accountRestrictions,
  adminActivationTokens,
  adminAssignments,
  adminAuditEvents,
  adminMfaDevices,
  adminPrincipals,
  adminRecoveryCodes,
  adminRoles,
  adminSecurityStates,
  adminSessions,
  workerHeartbeats,
} from "@/db/schema";

describe("admin database schema", () => {
  it("enforces the singleton super-admin slot in the database", () => {
    const config = getTableConfig(adminPrincipals);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      "admin_principals_singleton_slot_unique",
    );
    expect(config.checks.map((check) => check.name)).toContain(
      "admin_principals_kind_slot_check",
    );
  });

  it("keeps delegated roles and assignments separate", () => {
    expect(Object.keys(getTableColumns(adminRoles))).toEqual([
      "id",
      "name",
      "description",
      "permissions",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ]);
    expect(Object.keys(getTableColumns(adminAssignments))).toEqual([
      "userId",
      "roleId",
      "assignedByUserId",
      "accessVersion",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("declares independent MFA and management-session storage", () => {
    expect(Object.keys(getTableColumns(adminMfaDevices))).toContain(
      "encryptedSecret",
    );
    expect(Object.keys(getTableColumns(adminMfaDevices))).toContain(
      "lastAcceptedStep",
    );
    expect(Object.keys(getTableColumns(adminMfaDevices))).toContain(
      "verifiedAt",
    );
    expect(Object.keys(getTableColumns(adminRecoveryCodes))).toContain(
      "codeHash",
    );
    expect(Object.keys(getTableColumns(adminSessions))).toEqual(
      expect.arrayContaining([
        "tokenHash",
        "baseSessionId",
        "accessVersion",
        "idleExpiresAt",
        "absoluteExpiresAt",
        "revokedAt",
      ]),
    );
    expect(Object.keys(getTableColumns(adminSecurityStates))).toContain(
      "lockedUntil",
    );
  });

  it("provides activation, audit and worker-health records", () => {
    expect(Object.keys(getTableColumns(adminActivationTokens))).toContain(
      "tokenHash",
    );
    expect(Object.keys(getTableColumns(adminAuditEvents))).toContain("action");
    expect(Object.keys(getTableColumns(workerHeartbeats))).toContain(
      "lastSeenAt",
    );
  });

  it("stores product account restrictions outside Better Auth internals", () => {
    expect(Object.keys(getTableColumns(accountRestrictions))).toEqual([
      "userId",
      "suspendedAt",
      "suspendedUntil",
      "reason",
      "actorUserId",
      "updatedAt",
    ]);
  });
});
