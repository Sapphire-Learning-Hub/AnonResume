export type AccountSecurityErrorCode =
  | "account_unavailable"
  | "challenge_code_invalid"
  | "challenge_expired"
  | "challenge_invalid"
  | "challenge_rate_limited"
  | "challenge_resend_too_soon"
  | "current_session_required"
  | "email_in_use"
  | "merge_in_progress"
  | "password_incorrect"
  | "password_invalid"
  | "password_unavailable"
  | "recovery_period_ended"
  | "session_not_found";

export class AccountSecurityError extends Error {
  constructor(public readonly code: AccountSecurityErrorCode) {
    super(code);
    this.name = "AccountSecurityError";
  }
}
