export const jobErrorCodes = [
  "not_found",
  "version_conflict",
  "operation_conflict",
  "invalid_cursor",
  "account_unavailable",
  "application_date_required",
  "invalid_application_date",
  "application_reset_confirmation_required",
  "application_already_submitted",
  "system_event_immutable",
  "review_context_mismatch",
  "invalid_request",
] as const;
export type JobErrorCode = (typeof jobErrorCodes)[number];
export class JobSearchError extends Error {
  constructor(public readonly code: JobErrorCode) {
    super(code);
    this.name = "JobSearchError";
  }
}
export function checkVersion(actual: number, expected: number) {
  if (actual !== expected) throw new JobSearchError("version_conflict");
}
export function jobErrorStatus(code: JobErrorCode) {
  return code === "not_found"
    ? 404
    : code === "account_unavailable"
      ? 403
      : [
            "version_conflict",
            "operation_conflict",
            "application_reset_confirmation_required",
            "application_already_submitted",
          ].includes(code)
        ? 409
        : 400;
}
