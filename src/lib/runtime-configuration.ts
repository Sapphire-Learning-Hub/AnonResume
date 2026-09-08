import {
  decodeAdminMfaEncryptionKey,
  isValidAdminEmail,
} from "./admin-configuration";

type RuntimeEnvironment = Record<string, string | undefined>;

export type RuntimeConfigurationIssue =
  | "database_url_missing"
  | "database_url_invalid"
  | "better_auth_url_missing"
  | "better_auth_url_invalid"
  | "better_auth_secret_missing"
  | "better_auth_secret_invalid"
  | "smtp_host_missing"
  | "smtp_port_invalid"
  | "smtp_secure_invalid"
  | "smtp_user_missing"
  | "smtp_password_missing"
  | "email_from_missing"
  | "email_verification_expiry_invalid"
  | "pdf_max_concurrency_invalid"
  | "pdf_queue_limit_invalid"
  | "pdf_max_active_per_user_invalid"
  | "pdf_max_attempts_invalid"
  | "pdf_lease_invalid"
  | "pdf_result_ttl_invalid"
  | "pdf_force_expiry_invalid"
  | "pdf_allow_anonymous_invalid"
  | "pdf_queue_capacity_invalid"
  | "pdf_expiry_invalid"
  | "resume_history_limit_invalid"
  | "github_oauth_incomplete"
  | "source_code_url_invalid"
  | "database_schema_invalid"
  | "super_admin_email_missing"
  | "super_admin_email_invalid"
  | "admin_mfa_encryption_key_missing"
  | "admin_mfa_encryption_key_invalid"
  | "admin_session_idle_invalid"
  | "admin_session_max_invalid"
  | "admin_reauth_invalid"
  | "admin_session_lifetime_invalid"
  | "admin_reauth_window_invalid";

export interface RuntimeConfigurationStatus {
  valid: boolean;
  issues: RuntimeConfigurationIssue[];
}

const requiredPositiveIntegers = {
  EMAIL_VERIFICATION_EXPIRES_SECONDS: "email_verification_expiry_invalid",
  PDF_EXPORT_MAX_CONCURRENCY: "pdf_max_concurrency_invalid",
  PDF_EXPORT_QUEUE_LIMIT: "pdf_queue_limit_invalid",
  PDF_EXPORT_MAX_ACTIVE_PER_USER: "pdf_max_active_per_user_invalid",
  PDF_EXPORT_MAX_ATTEMPTS: "pdf_max_attempts_invalid",
  PDF_EXPORT_LEASE_MS: "pdf_lease_invalid",
  PDF_EXPORT_RESULT_TTL_MS: "pdf_result_ttl_invalid",
  PDF_EXPORT_FORCE_EXPIRY_MS: "pdf_force_expiry_invalid",
  RESUME_VERSION_HISTORY_LIMIT: "resume_history_limit_invalid",
  ADMIN_SESSION_IDLE_SECONDS: "admin_session_idle_invalid",
  ADMIN_SESSION_MAX_SECONDS: "admin_session_max_invalid",
  ADMIN_REAUTH_SECONDS: "admin_reauth_invalid",
} as const satisfies Record<string, RuntimeConfigurationIssue>;

function isPositiveInteger(value: string | undefined) {
  if (!value?.trim()) return false;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function parsePositiveInteger(value: string | undefined) {
  return isPositiveInteger(value) ? Number(value) : undefined;
}

function parseAbsoluteUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;

  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
}

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

export function validateRuntimeConfiguration(
  environment: RuntimeEnvironment,
): RuntimeConfigurationStatus {
  if (environment.NODE_ENV !== "production") {
    return { valid: true, issues: [] };
  }

  const issues: RuntimeConfigurationIssue[] = [];
  const databaseUrl = parseAbsoluteUrl(environment.DATABASE_URL);

  if (!hasText(environment.DATABASE_URL)) {
    issues.push("database_url_missing");
  } else if (
    !databaseUrl ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    databaseUrl.pathname === "/"
  ) {
    issues.push("database_url_invalid");
  }

  const authUrl = parseAbsoluteUrl(environment.BETTER_AUTH_URL);

  if (!hasText(environment.BETTER_AUTH_URL)) {
    issues.push("better_auth_url_missing");
  } else if (
    !authUrl ||
    authUrl.protocol !== "https:" ||
    !authUrl.hostname ||
    authUrl.username ||
    authUrl.password ||
    authUrl.search ||
    authUrl.hash ||
    (authUrl.pathname !== "/" && authUrl.pathname !== "")
  ) {
    issues.push("better_auth_url_invalid");
  }

  if (!hasText(environment.BETTER_AUTH_SECRET)) {
    issues.push("better_auth_secret_missing");
  } else if (
    environment.BETTER_AUTH_SECRET!.trim().length < 32 ||
    environment.BETTER_AUTH_SECRET!.includes("replace_with")
  ) {
    issues.push("better_auth_secret_invalid");
  }

  if (!hasText(environment.SMTP_HOST)) issues.push("smtp_host_missing");
  if (!hasText(environment.SMTP_USER)) issues.push("smtp_user_missing");
  if (!hasText(environment.SMTP_PASSWORD)) issues.push("smtp_password_missing");
  if (!hasText(environment.EMAIL_FROM)) issues.push("email_from_missing");

  if (!hasText(environment.ANONRESUME_SUPER_ADMIN_EMAIL)) {
    issues.push("super_admin_email_missing");
  } else if (!isValidAdminEmail(environment.ANONRESUME_SUPER_ADMIN_EMAIL)) {
    issues.push("super_admin_email_invalid");
  }

  if (!hasText(environment.ADMIN_MFA_ENCRYPTION_KEY)) {
    issues.push("admin_mfa_encryption_key_missing");
  } else if (
    !decodeAdminMfaEncryptionKey(environment.ADMIN_MFA_ENCRYPTION_KEY)
  ) {
    issues.push("admin_mfa_encryption_key_invalid");
  }

  const smtpPort = Number(environment.SMTP_PORT);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) {
    issues.push("smtp_port_invalid");
  }

  if (!["true", "false"].includes(environment.SMTP_SECURE ?? "")) {
    issues.push("smtp_secure_invalid");
  }

  for (const [key, issue] of Object.entries(requiredPositiveIntegers)) {
    if (!isPositiveInteger(environment[key])) issues.push(issue);
  }

  const emailVerificationExpiry = parsePositiveInteger(
    environment.EMAIL_VERIFICATION_EXPIRES_SECONDS,
  );
  if (
    emailVerificationExpiry !== undefined &&
    emailVerificationExpiry < 300
  ) {
    issues.push("email_verification_expiry_invalid");
  }

  if (
    !["true", "false"].includes(
      environment.PDF_EXPORT_ALLOW_ANONYMOUS ?? "",
    )
  ) {
    issues.push("pdf_allow_anonymous_invalid");
  }

  const maxConcurrency = parsePositiveInteger(
    environment.PDF_EXPORT_MAX_CONCURRENCY,
  );
  const queueLimit = parsePositiveInteger(environment.PDF_EXPORT_QUEUE_LIMIT);
  const maxActivePerUser = parsePositiveInteger(
    environment.PDF_EXPORT_MAX_ACTIVE_PER_USER,
  );

  if (
    maxConcurrency !== undefined &&
    queueLimit !== undefined &&
    (maxConcurrency > queueLimit ||
      (maxActivePerUser !== undefined && maxActivePerUser > queueLimit))
  ) {
    issues.push("pdf_queue_capacity_invalid");
  }

  const resultTtl = parsePositiveInteger(environment.PDF_EXPORT_RESULT_TTL_MS);
  const forceExpiry = parsePositiveInteger(
    environment.PDF_EXPORT_FORCE_EXPIRY_MS,
  );

  if (
    resultTtl !== undefined &&
    forceExpiry !== undefined &&
    forceExpiry < resultTtl
  ) {
    issues.push("pdf_expiry_invalid");
  }

  const adminIdleSeconds = parsePositiveInteger(
    environment.ADMIN_SESSION_IDLE_SECONDS,
  );
  const adminMaxSeconds = parsePositiveInteger(
    environment.ADMIN_SESSION_MAX_SECONDS,
  );
  const adminReauthSeconds = parsePositiveInteger(
    environment.ADMIN_REAUTH_SECONDS,
  );

  if (
    adminIdleSeconds !== undefined &&
    adminMaxSeconds !== undefined &&
    adminIdleSeconds > adminMaxSeconds
  ) {
    issues.push("admin_session_lifetime_invalid");
  }
  if (
    adminReauthSeconds !== undefined &&
    adminMaxSeconds !== undefined &&
    adminReauthSeconds > adminMaxSeconds
  ) {
    issues.push("admin_reauth_window_invalid");
  }

  if (
    hasText(environment.GITHUB_CLIENT_ID) !==
    hasText(environment.GITHUB_CLIENT_SECRET)
  ) {
    issues.push("github_oauth_incomplete");
  }

  if (hasText(environment.NEXT_PUBLIC_SOURCE_CODE_URL)) {
    const sourceCodeUrl = parseAbsoluteUrl(
      environment.NEXT_PUBLIC_SOURCE_CODE_URL,
    );

    if (!sourceCodeUrl || sourceCodeUrl.protocol !== "https:") {
      issues.push("source_code_url_invalid");
    }
  }

  if (
    hasText(environment.ANONRESUME_DB_SCHEMA) &&
    !/^[a-z_][a-z0-9_]*$/i.test(environment.ANONRESUME_DB_SCHEMA!.trim())
  ) {
    issues.push("database_schema_invalid");
  }

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
  };
}

export function resolveApplicationOriginForBootstrap(
  environment: RuntimeEnvironment,
) {
  const rawUrl = environment.BETTER_AUTH_URL?.trim();

  if (!rawUrl) {
    return "http://localhost:3000";
  }

  const url = parseAbsoluteUrl(rawUrl);

  if (!url || !["http:", "https:"].includes(url.protocol)) {
    return "http://localhost:3000";
  }

  return url.origin;
}
