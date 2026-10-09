export type SocialRegistrationErrorCode =
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
  return code === "intent_expired" ? 410 : 400;
}
