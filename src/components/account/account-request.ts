import type { MessageKey } from "@/i18n/messages";

type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string;

export class AccountRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AccountRequestError";
  }
}

export async function requestAccountJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: unknown;
    } | null;
    throw new AccountRequestError(
      typeof payload?.error === "string" ? payload.error : "unknown",
    );
  }
  return response.json() as Promise<T>;
}

const accountErrorMessages: Readonly<Record<string, MessageKey>> = {
  account_unavailable: "account.error.unavailable",
  challenge_code_invalid: "account.error.codeInvalid",
  challenge_expired: "account.error.codeExpired",
  challenge_invalid: "account.error.codeInvalid",
  challenge_rate_limited: "account.error.rateLimited",
  challenge_resend_too_soon: "account.error.resendTooSoon",
  current_session_required: "account.error.currentSession",
  email_in_use: "account.error.emailInUse",
  merge_in_progress: "account.error.mergeInProgress",
  password_incorrect: "account.error.passwordIncorrect",
  password_invalid: "account.error.passwordInvalid",
  password_unavailable: "account.error.passwordUnavailable",
  recovery_period_ended: "account.error.recoveryEnded",
  session_not_found: "account.error.sessionNotFound",
};

export function accountRequestErrorMessage(
  error: unknown,
  t: Translate,
) {
  if (error instanceof AccountRequestError) {
    const key = accountErrorMessages[error.code];
    if (key) return t(key);
  }
  return t("account.error.action");
}
