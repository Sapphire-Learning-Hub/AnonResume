import { describe, expect, it } from "vitest";

import {
  diagnoseConfiguration,
  type ConfigurationDoctorInput,
} from "@/lib/config/doctor";
import { inspectBootstrapCredentials } from "@/lib/config/bootstrap";

const NOW = new Date("2026-09-20T00:00:00.000Z");

function healthyInput(): ConfigurationDoctorInput {
  return {
    credentials: [
      { name: "anonresume.database-url", required: true, status: "present" },
      {
        name: "anonresume.application-origin",
        required: true,
        status: "present",
      },
      { name: "anonresume.auth-secret", required: true, status: "present" },
      {
        name: "anonresume.config-master-key",
        required: true,
        status: "present",
      },
      {
        name: "anonresume.legacy-admin-mfa-key",
        required: false,
        status: "absent",
      },
      {
        name: "anonresume.legacy-ai-credentials-key",
        required: false,
        status: "absent",
      },
    ],
    legacySecrets: {
      adminMfaDevices: 0,
      aiAuditPayloads: 0,
      aiProviderCredentials: 0,
      aiRuns: 0,
      total: 0,
    },
    now: NOW,
    revisions: {
      activeReadable: true,
      activeVersion: 4,
      draftVersion: 5,
      fallbackVersion: null,
    },
    runtimes: ["web", "pdf-worker", "ai-worker"].map((consumer) => ({
      consumer: consumer as "web" | "pdf-worker" | "ai-worker",
      desiredVersion: 4,
      health: "healthy" as const,
      hotVersion: 4,
      lastSeenAt: new Date(NOW.getTime() - 10_000),
      restartVersion: 4,
    })),
    staleAfterMs: 90_000,
    unsupportedSecrets: {
      adminMfaDevices: 0,
      aiAuditPayloads: 0,
      aiProviderCredentials: 0,
      aiRuns: 0,
      total: 0,
    },
  };
}

describe("configuration doctor", () => {
  it("inspects credential names without returning their values or source path", () => {
    const secret = "s".repeat(64);
    const credentialDirectory = "/run/credentials/anonresume.service";
    const report = inspectBootstrapCredentials({
      environment: {
        CREDENTIALS_DIRECTORY: credentialDirectory,
        NODE_ENV: "production",
      },
      readCredential: (name) => ({
        "anonresume.application-origin": "http://resume.example.com",
        "anonresume.auth-secret": secret,
        "anonresume.config-master-key": "invalid-key",
        "anonresume.database-url": "postgresql://app:secret@db/app",
      })[name],
    });

    expect(report).toEqual(expect.arrayContaining([
      {
        name: "anonresume.database-url",
        required: true,
        status: "present",
      },
      {
        name: "anonresume.application-origin",
        required: true,
        status: "invalid",
      },
      {
        name: "anonresume.config-master-key",
        required: true,
        status: "invalid",
      },
    ]));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(credentialDirectory);
    expect(serialized).not.toContain("postgresql://");
  });

  it("reports names-only healthy configuration state", () => {
    const report = diagnoseConfiguration(healthyInput());

    expect(report.status).toBe("healthy");
    expect(report.exitCode).toBe(0);
    expect(report.revisions).toEqual({
      activeVersion: 4,
      draftVersion: 5,
      fallbackVersion: null,
    });
    expect(report.runtimes).toEqual([
      expect.objectContaining({ consumer: "web", hotVersion: 4, stale: false }),
      expect.objectContaining({ consumer: "pdf-worker", restartVersion: 4 }),
      expect.objectContaining({ consumer: "ai-worker", desiredVersion: 4 }),
    ]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("CREDENTIALS_DIRECTORY");
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("ciphertext");
  });

  it("uses a distinct warning state for fallback and pending restart", () => {
    const input = healthyInput();
    input.revisions.activeReadable = false;
    input.revisions.fallbackVersion = 3;
    input.runtimes[0]!.restartVersion = 3;

    const report = diagnoseConfiguration(input);

    expect(report.status).toBe("warning");
    expect(report.exitCode).toBe(2);
    expect(report.issues).toEqual([
      "active_revision_using_fallback",
      "runtime_restart_required:web",
    ]);
  });

  it("blocks missing roots, stale consumers, unknown versions, and unusable legacy rows", () => {
    const input = healthyInput();
    input.credentials[0] = {
      name: "anonresume.database-url",
      required: true,
      status: "missing",
    };
    input.runtimes[1]!.lastSeenAt = new Date(NOW.getTime() - 120_000);
    input.unsupportedSecrets.aiRuns = 1;
    input.unsupportedSecrets.total = 1;
    input.legacySecrets.adminMfaDevices = 2;
    input.legacySecrets.total = 2;

    const report = diagnoseConfiguration(input);

    expect(report.status).toBe("error");
    expect(report.exitCode).toBe(1);
    expect(report.issues).toEqual(expect.arrayContaining([
      "credential_missing:anonresume.database-url",
      "runtime_stale:pdf-worker",
      "unsupported_secret_versions",
      "legacy_admin_key_required",
    ]));
  });

  it("blocks an unreadable active revision without a usable fallback", () => {
    const input = healthyInput();
    input.revisions.activeReadable = false;

    const report = diagnoseConfiguration(input);

    expect(report.status).toBe("error");
    expect(report.issues).toContain("configuration_revision_unreadable");
  });
});
