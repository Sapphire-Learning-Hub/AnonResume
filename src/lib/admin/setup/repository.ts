import { sql } from "drizzle-orm";

import { db, instanceSetupState } from "@/db";

import type { InstanceSetupSnapshot, InstanceSetupState } from "./types";

export const INSTANCE_SETUP_LOCK = "anonresume:instance-setup";

type InstanceSetupTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export class InstanceSetupStateIntegrityError extends Error {
  constructor() {
    super("instance_setup_state_integrity_error");
    this.name = "InstanceSetupStateIntegrityError";
  }
}

function isInstanceSetupState(value: string): value is InstanceSetupState {
  return (
    value === "pending_initialization" ||
    value === "pending_admin_recovery" ||
    value === "completed"
  );
}

function toSnapshot(
  rows: Array<{
    state: string;
    targetUserId: string | null;
    recoveryReason: string | null;
    completedAt: Date | null;
    updatedAt: Date;
  }>,
): InstanceSetupSnapshot {
  const row = rows[0];

  if (rows.length !== 1 || !row || !isInstanceSetupState(row.state)) {
    throw new InstanceSetupStateIntegrityError();
  }

  return {
    state: row.state,
    targetUserId: row.targetUserId,
    recoveryReason: row.recoveryReason,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}

const snapshotSelection = {
  state: instanceSetupState.state,
  targetUserId: instanceSetupState.targetUserId,
  recoveryReason: instanceSetupState.recoveryReason,
  completedAt: instanceSetupState.completedAt,
  updatedAt: instanceSetupState.updatedAt,
};

export async function getInstanceSetupSnapshot(
  client?: InstanceSetupTransaction,
): Promise<InstanceSetupSnapshot> {
  const rows = client
    ? await client
        .select(snapshotSelection)
        .from(instanceSetupState)
        .limit(2)
    : await db.select(snapshotSelection).from(instanceSetupState).limit(2);

  return toSnapshot(rows);
}

export async function withInstanceSetupLock<T>(
  callback: (transaction: InstanceSetupTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${INSTANCE_SETUP_LOCK}))`,
    );

    return callback(transaction);
  });
}
