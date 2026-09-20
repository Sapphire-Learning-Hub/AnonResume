import type { Pool } from "pg";

import { getDatabaseSchemaName } from "@/db";
import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "@/lib/admin/audit";
import { INSTANCE_SETUP_LOCK } from "@/lib/admin/setup/repository";
import { getDatabasePool } from "@/lib/runtime/database";
import {
  resolveRuntimeIdentity,
  type RuntimeIdentity,
} from "@/lib/runtime/instance-identity";

export interface SetupRecoveryResult {
  state: "pending_admin_recovery";
  targetUserId: string | null;
}

export class SetupRecoveryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SetupRecoveryError";
  }
}

interface SetupRecoveryDependencies {
  getPool: () => Pool;
  resolveIdentity: () => Pick<RuntimeIdentity, "deploymentId">;
}

const defaultDependencies: SetupRecoveryDependencies = {
  getPool: getDatabasePool,
  resolveIdentity: () => resolveRuntimeIdentity("web"),
};

export async function deactivateInstanceSetup(
  input: { deploymentId: string; reason: string },
  dependencies: SetupRecoveryDependencies = defaultDependencies,
): Promise<SetupRecoveryResult> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new SetupRecoveryError("setup_recovery_reason_required");
  }

  const identity = dependencies.resolveIdentity();
  if (input.deploymentId !== identity.deploymentId) {
    throw new SetupRecoveryError("setup_recovery_confirmation_invalid");
  }

  const client = await dependencies.getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      INSTANCE_SETUP_LOCK,
    ]);
    const stateResult = await client.query<{ state: string }>(
      `SELECT state FROM ${schema()}.instance_setup_state
        WHERE slot = 1 FOR UPDATE`,
    );
    if (stateResult.rows[0]?.state !== "completed") {
      throw new SetupRecoveryError("setup_recovery_unavailable");
    }

    const principalResult = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM ${schema()}.admin_principals
        WHERE kind = 'super_admin' AND quarantined_at IS NULL
        ORDER BY created_at ASC FOR UPDATE`,
    );
    if (principalResult.rows.length > 1) {
      throw new SetupRecoveryError("setup_recovery_integrity_error");
    }
    const targetUserId = principalResult.rows[0]?.userId ?? null;
    const now = new Date();

    await client.query(
      `UPDATE ${schema()}.admin_principals
          SET access_version = access_version + 1, updated_at = $1
        WHERE quarantined_at IS NULL`,
      [now],
    );
    await client.query(
      `UPDATE ${schema()}.admin_sessions
          SET revoked_at = COALESCE(revoked_at, $1)`,
      [now],
    );
    if (targetUserId) {
      await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [
        targetUserId,
      ]);
    }
    await client.query(
      `UPDATE ${schema()}.instance_setup_state
          SET state = 'pending_admin_recovery', target_user_id = $1,
              recovery_reason = $2, completed_at = NULL, updated_at = $3
        WHERE slot = 1`,
      [targetUserId, reason, now],
    );
    await client.query(`DELETE FROM ${schema()}.instance_setup_sessions`);
    await client.query(`DELETE FROM ${schema()}.instance_setup_tokens`);
    await client.query(`DELETE FROM ${schema()}.instance_setup_claim_limits`);
    await writeAdminAuditEventWithClient(client, {
      action: "instance.setup.deactivate",
      targetType: "instance_setup",
      targetId: identity.deploymentId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { state: "completed" },
          { state: "pending_admin_recovery" },
        ),
        deploymentId: identity.deploymentId,
        reason,
        targetUserId,
      },
    });
    await client.query("COMMIT");
    return { state: "pending_admin_recovery", targetUserId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function parseSetupDeactivateArguments(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      (flag !== "--reason" && flag !== "--confirm") ||
      !value ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new SetupRecoveryError("setup_recovery_usage");
    }
    values.set(flag, value);
  }

  const reason = values.get("--reason");
  const deploymentId = values.get("--confirm");
  if (!reason || !deploymentId || values.size !== 2) {
    throw new SetupRecoveryError("setup_recovery_usage");
  }
  return { reason, deploymentId };
}

function schema() {
  return `"${getDatabaseSchemaName().replaceAll('"', '""')}"`;
}
