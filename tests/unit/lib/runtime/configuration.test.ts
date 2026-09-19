import { describe, expect, it } from "vitest";

import {
  resolveApplicationOriginForBootstrap,
  validateBootstrapConfiguration,
  validateRuntimeConfiguration,
} from "@/lib/runtime/configuration";

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://anonresume:secret@db.example.com:5432/anonresume",
  BETTER_AUTH_URL: "https://resume.example.com",
  BETTER_AUTH_SECRET: "a".repeat(64),
  CONFIG_MASTER_KEY: Buffer.alloc(32, 5).toString("base64"),
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

describe("bootstrap runtime configuration", () => {
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

  it("reports missing and malformed production trust roots without their values", () => {
    const result = validateRuntimeConfiguration({
      ...validProductionEnvironment,
      BETTER_AUTH_URL: "http://resume.example.com",
      BETTER_AUTH_SECRET: "short",
      CONFIG_MASTER_KEY: "invalid",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "application_origin_invalid",
        "auth_secret_invalid",
        "config_master_key_invalid",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("resume.example.com");
  });

  it("does not treat managed feature settings as bootstrap failures", () => {
    const result = validateRuntimeConfiguration({
      ...validProductionEnvironment,
      GITHUB_CLIENT_ID: "github-client",
      PDF_EXPORT_MAX_CONCURRENCY: "8",
      PDF_EXPORT_QUEUE_LIMIT: "4",
      PDF_EXPORT_FORCE_EXPIRY_MS: "60000",
      PDF_EXPORT_RESULT_TTL_MS: "900000",
      SMTP_PASSWORD: "",
    });

    expect(result).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("exposes the bootstrap validator under its explicit name", () => {
    expect(validateBootstrapConfiguration({
      environment: validProductionEnvironment,
    })).toEqual({ valid: true, issues: [] });
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
