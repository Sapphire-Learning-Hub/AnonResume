export type SocialRegistrationErrorCode =
  | "email_attempts_exhausted"
  | "email_code_expired"
  | "email_code_invalid"
  | "email_conflict"
  | "email_invalid"
  | "email_not_required"
  | "email_resend_too_soon"
  | "intent_expired"
  | "intent_invalid"
  | "profile_missing";

export class SocialRegistrationError extends Error {
  constructor(public readonly code: SocialRegistrationErrorCode) {
    super(code);
    this.name = "SocialRegistrationError";
  }
}

export function getSocialRegistrationErrorStatus(
  code: SocialRegistrationErrorCode,
) {
  switch (code) {
    case "intent_expired":
      return 410;
    case "email_conflict":
      return 409;
    case "email_resend_too_soon":
    case "email_attempts_exhausted":
      return 429;
    default:
      return 400;
  }
}
