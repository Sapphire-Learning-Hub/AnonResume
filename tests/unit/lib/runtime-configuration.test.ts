import { describe, expect, it } from "vitest";

import {
  resolveApplicationOriginForBootstrap,
  validateRuntimeConfiguration,
} from "@/lib/runtime-configuration";

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://anonresume:secret@db.example.com:5432/anonresume",
  BETTER_AUTH_URL: "https://resume.example.com",
  BETTER_AUTH_SECRET: "a".repeat(64),
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "mailer@example.com",
  SMTP_PASSWORD: "smtp-secret",
  EMAIL_FROM: "AnonResume <mailer@example.com>",
  EMAIL_VERIFICATION_EXPIRES_SECONDS: "3600",
  PDF_EXPORT_MAX_CONCURRENCY: "2",
  PDF_EXPORT_QUEUE_LIMIT: "100",
  PDF_EXPORT_MAX_ACTIVE_PER_USER: "3",
  PDF_EXPORT_MAX_ATTEMPTS: "3",
  PDF_EXPORT_LEASE_MS: "60000",
  PDF_EXPORT_RESULT_TTL_MS: "900000",
  PDF_EXPORT_FORCE_EXPIRY_MS: "86400000",
  PDF_EXPORT_ALLOW_ANONYMOUS: "false",
  RESUME_VERSION_HISTORY_LIMIT: "5",
  ANONRESUME_SUPER_ADMIN_EMAIL: "owner@example.com",
  ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  ADMIN_SESSION_IDLE_SECONDS: "1800",
  ADMIN_SESSION_MAX_SECONDS: "28800",
  ADMIN_REAUTH_SECONDS: "300",
} satisfies Record<string, string>;

describe("validateRuntimeConfiguration", () => {
  it("does not block development when deployment variables are absent", () => {
    expect(validateRuntimeConfiguration({ NODE_ENV: "development" })).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("accepts a complete production configuration", () => {
    expect(validateRuntimeConfiguration(validProductionEnvironment)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("reports missing and malformed production settings without their values", () => {
    const result = validateRuntimeConfiguration({
      ...validProductionEnvironment,
      BETTER_AUTH_URL: "http://resume.example.com",
      BETTER_AUTH_SECRET: "short",
      SMTP_PASSWORD: "",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "better_auth_url_invalid",
        "better_auth_secret_invalid",
        "smtp_password_missing",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("resume.example.com");
  });

  it("rejects incoherent queue limits and incomplete optional OAuth settings", () => {
    const result = validateRuntimeConfiguration({
      ...validProductionEnvironment,
      GITHUB_CLIENT_ID: "github-client",
      PDF_EXPORT_MAX_CONCURRENCY: "8",
      PDF_EXPORT_QUEUE_LIMIT: "4",
      PDF_EXPORT_FORCE_EXPIRY_MS: "60000",
      PDF_EXPORT_RESULT_TTL_MS: "900000",
    });

    expect(result).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        "github_oauth_incomplete",
        "pdf_queue_capacity_invalid",
        "pdf_expiry_invalid",
      ]),
    });
  });

  it("rejects unsafe management-console configuration", () => {
    const result = validateRuntimeConfiguration({
      ...validProductionEnvironment,
      ANONRESUME_SUPER_ADMIN_EMAIL: "not-an-email",
      ADMIN_MFA_ENCRYPTION_KEY: "too-short",
      ADMIN_SESSION_IDLE_SECONDS: "3600",
      ADMIN_SESSION_MAX_SECONDS: "1800",
      ADMIN_REAUTH_SECONDS: "3601",
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        "super_admin_email_invalid",
        "admin_mfa_encryption_key_invalid",
        "admin_session_lifetime_invalid",
        "admin_reauth_window_invalid",
      ]),
    );
  });

  it("keeps route collection bootable while the request gate rejects an invalid origin", () => {
    const environment = {
      ...validProductionEnvironment,
      BETTER_AUTH_URL: "http://localhost:3000",
    };

    expect(validateRuntimeConfiguration(environment).valid).toBe(false);
    expect(() =>
      resolveApplicationOriginForBootstrap(environment),
    ).not.toThrow();
    expect(resolveApplicationOriginForBootstrap(environment)).toBe(
      "http://localhost:3000",
    );
  });
});
