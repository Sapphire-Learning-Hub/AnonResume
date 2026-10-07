export type AccountLifecycleStatus =
  | "active"
  | "pending_deletion"
  | "deleted";

export type AccountLifecycleSnapshot = {
  status: AccountLifecycleStatus;
  deletionRequestedAt: Date | null;
  deletionDueAt: Date | null;
  deletedAt: Date | null;
  explicit: boolean;
};

export type AccountEmailChallengePurpose =
  | "change_email_old"
  | "change_email_new"
  | "delete_account"
  | "restore_account";
