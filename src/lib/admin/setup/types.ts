export type InstanceSetupState =
  | "pending_initialization"
  | "pending_admin_recovery"
  | "completed";

export interface InstanceSetupSnapshot {
  state: InstanceSetupState;
  targetUserId: string | null;
  recoveryReason: string | null;
  completedAt: Date | null;
  updatedAt: Date;
}
