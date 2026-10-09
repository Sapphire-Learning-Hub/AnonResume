export type AccountMergeErrorCode =
  | "account_unavailable"
  | "administrator_must_be_primary"
  | "administrator_pair"
  | "credential_invalid"
  | "intent_expired"
  | "intent_invalid"
  | "merge_in_progress"
  | "password_unavailable"
  | "primary_choice_invalid"
  | "provider_conflict"
  | "provider_ownership_changed"
  | "same_account"
  | "target_is_administrator";

export class AccountMergeError extends Error {
  constructor(public readonly code: AccountMergeErrorCode) {
    super(code);
    this.name = "AccountMergeError";
  }
}

export function getAccountMergeErrorStatus(code: AccountMergeErrorCode) {
  switch (code) {
    case "account_unavailable":
    case "target_is_administrator":
    case "administrator_pair":
      return 403;
    case "merge_in_progress":
    case "provider_conflict":
    case "provider_ownership_changed":
      return 409;
    case "intent_expired":
      return 410;
    default:
      return 400;
  }
}
