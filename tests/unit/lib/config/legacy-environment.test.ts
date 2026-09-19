import { CONFIG_REGISTRY } from "@/lib/config/registry";
import {
  formatLegacyEnvironmentPlan,
  LEGACY_MANAGED_ENVIRONMENT_KEYS,
  resolveLegacyManagedConfig,
} from "@/lib/config/legacy-environment";

describe("legacy managed environment import", () => {
  it("maps every managed environment key to exactly one registry key", () => {
    const registered = Object.entries(CONFIG_REGISTRY)
      .filter(([, definition]) => definition.environmentKey)
      .map(([, definition]) => definition.environmentKey);

    expect(new Set(registered).size).toBe(registered.length);
    expect(Object.keys(LEGACY_MANAGED_ENVIRONMENT_KEYS).sort()).toEqual(
      [...registered].sort(),
    );
  });

  it("ignores unknown and deployment-only environment keys", () => {
    const resolved = resolveLegacyManagedConfig({
      BETTER_AUTH_SECRET: "deploy-only-secret",
      UNKNOWN_SETTING: "ignored",
      RESUME_VERSION_HISTORY_LIMIT: "8",
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.values).toEqual({ resumeVersionHistoryLimit: 8 });
    expect(resolved.entries).toContainEqual({
      environmentKey: "BETTER_AUTH_SECRET",
      status: "ignored",
    });
    expect(resolved.entries.some((entry) => entry.environmentKey === "UNKNOWN_SETTING"))
      .toBe(false);
  });

  it("rejects partial SMTP and OAuth groups", () => {
    expect(
      resolveLegacyManagedConfig({ SMTP_HOST: "smtp.example.com" }).valid,
    ).toBe(false);
    expect(
      resolveLegacyManagedConfig({ GITHUB_CLIENT_ID: "client-id" }).valid,
    ).toBe(false);
  });

  it("formats a dry run without exposing supplied secrets", () => {
    const resolved = resolveLegacyManagedConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "mailer@example.com",
      SMTP_PASSWORD: "never-print-this",
      EMAIL_FROM: "AnonResume <mailer@example.com>",
    });
    const output = formatLegacyEnvironmentPlan(resolved.entries);

    expect(output).toContain("SMTP_PASSWORD: import");
    expect(output).toContain("SMTP_PORT: missing");
    expect(output).not.toContain("never-print-this");
    expect(output).not.toContain("mailer@example.com");
  });
});
