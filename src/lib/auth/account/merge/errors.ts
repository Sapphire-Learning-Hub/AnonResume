export type AccountMergeErrorCode =
  | "account_unavailable"
  | "administrator_must_be_primary"
  | "administrator_pair"
  | "confirmation_too_early"
  | "credential_invalid"
  | "current_password_invalid"
  | "intent_expired"
  | "intent_invalid"
  | "merge_in_progress"
  | "mfa_invalid"
  | "mfa_required"
  | "operation_invalid"
  | "password_unavailable"
  | "primary_choice_invalid"
  | "provider_conflict"
  | "provider_ownership_changed"
  | "same_account"
  | "target_credentials_invalid"
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
    case "confirmation_too_early":
      return 425;
    case "intent_expired":
      return 410;
    default:
      return 400;
  }
}
