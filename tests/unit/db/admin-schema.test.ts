import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import * as adminSchema from "@/db/schema";

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
  announcements,
  workerHeartbeats,
} from "@/db/schema";

describe("admin database schema", () => {
  it("stores explicit instance setup state, claims and rate limits", () => {
    expect(Object.keys(getTableColumns(adminSchema.instanceSetupState))).toEqual([
      "slot",
      "state",
      "targetUserId",
      "recoveryReason",
      "completedAt",
      "createdAt",
      "updatedAt",
    ]);
    expect(Object.keys(getTableColumns(adminSchema.instanceSetupTokens))).toEqual([
      "id",
      "sourceInstanceId",
      "generation",
      "tokenHash",
      "expiresAt",
      "createdAt",
    ]);
    expect(Object.keys(getTableColumns(adminSchema.instanceSetupSessions))).toEqual([
      "id",
      "tokenHash",
      "generation",
      "expiresAt",
      "createdAt",
    ]);
    expect(
      Object.keys(getTableColumns(adminSchema.instanceSetupClaimLimits)),
    ).toEqual([
      "sourceHash",
      "failedAttempts",
      "windowStartedAt",
      "expiresAt",
      "updatedAt",
    ]);

    const stateConfig = getTableConfig(adminSchema.instanceSetupState);
    expect(stateConfig.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "instance_setup_state_slot_check",
        "instance_setup_state_value_check",
      ]),
    );
    expect(
      getTableConfig(adminSchema.instanceSetupTokens).indexes.map(
        (index) => index.config.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "instance_setup_tokens_source_unique",
        "instance_setup_tokens_hash_unique",
        "instance_setup_tokens_expiry_idx",
      ]),
    );
    expect(
      getTableConfig(adminSchema.instanceSetupSessions).indexes.map(
        (index) => index.config.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "instance_setup_sessions_hash_unique",
        "instance_setup_sessions_generation_idx",
        "instance_setup_sessions_expiry_idx",
      ]),
    );
    expect(
      getTableConfig(adminSchema.instanceSetupClaimLimits).indexes.map(
        (index) => index.config.name,
      ),
    ).toContain("instance_setup_claim_limits_expiry_idx");
  });

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
      "systemKey",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ]);
    const config = getTableConfig(adminRoles);
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "admin_roles_system_key_unique",
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "admin_roles_origin_check",
    );
    expect(Object.keys(getTableColumns(adminAssignments))).toEqual([
      "userId",
      "roleId",
      "assignedByUserId",
      "createdAt",
      "updatedAt",
    ]);
    expect(Object.keys(getTableColumns(adminPrincipals))).toContain(
      "accessVersion",
    );
    const assignmentConfig = getTableConfig(adminAssignments);
    expect(assignmentConfig.primaryKeys).toHaveLength(1);
    expect(
      assignmentConfig.primaryKeys[0]?.columns.map((column) => column.name),
    ).toEqual(["user_id", "role_id"]);
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

  it("enforces one pending MFA reset request per delegated administrator", () => {
    const config = getTableConfig(adminMfaResetRequests);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      "admin_mfa_reset_requests_requester_pending_unique",
    );
    expect(config.checks.map((check) => check.name)).toContain(
      "admin_mfa_reset_requests_status_check",
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

  it("stores bounded global announcements with constrained presentation fields", () => {
    expect(Object.keys(getTableColumns(announcements))).toEqual([
      "id",
      "titleZh",
      "bodyZh",
      "titleEn",
      "bodyEn",
      "tone",
      "audience",
      "dismissible",
      "status",
      "publishedAt",
      "expiresAt",
      "createdByUserId",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ]);

    const config = getTableConfig(announcements);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "announcements_tone_check",
        "announcements_audience_check",
        "announcements_status_check",
        "announcements_english_copy_check",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "announcements_active_idx",
    );
  });
});
