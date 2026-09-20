import type { LegacySecretCounts } from "@/lib/config/secret-migration";
import type { ManagedConfigurationHealthState } from "@/lib/config/health";
import type { ConfigConsumer } from "@/lib/config/types";

export type ConfigurationDoctorCredentialStatus =
  | "absent"
  | "invalid"
  | "missing"
  | "present";

export interface ConfigurationDoctorCredential {
  name: string;
  required: boolean;
  status: ConfigurationDoctorCredentialStatus;
}

export interface ConfigurationDoctorRuntimeInput {
  consumer: ConfigConsumer;
  desiredVersion: number | null;
  health: ManagedConfigurationHealthState;
  hotVersion: number | null;
  lastSeenAt: Date;
  restartVersion: number | null;
}

export interface ConfigurationDoctorInput {
  credentials: ConfigurationDoctorCredential[];
  legacySecrets: LegacySecretCounts;
  now: Date;
  revisions: {
    activeReadable: boolean;
    activeVersion: number | null;
    draftVersion: number | null;
    fallbackVersion: number | null;
  };
  runtimes: ConfigurationDoctorRuntimeInput[];
  staleAfterMs: number;
  unsupportedSecrets: LegacySecretCounts;
}

export interface ConfigurationDoctorReport {
  credentials: ConfigurationDoctorCredential[];
  exitCode: 0 | 1 | 2;
  issues: string[];
  legacySecrets: LegacySecretCounts;
  revisions: {
    activeVersion: number | null;
    draftVersion: number | null;
    fallbackVersion: number | null;
  };
  runtimes: Array<{
    consumer: ConfigConsumer;
    desiredVersion: number | null;
    health: ManagedConfigurationHealthState | "missing";
    hotVersion: number | null;
    pendingRestart: boolean;
    restartVersion: number | null;
    stale: boolean;
  }>;
  status: "error" | "healthy" | "warning";
  unsupportedSecrets: LegacySecretCounts;
}

const REQUIRED_CONSUMERS: readonly ConfigConsumer[] = [
  "web",
  "pdf-worker",
  "ai-worker",
];

const EMPTY_SECRET_COUNTS: LegacySecretCounts = {
  adminMfaDevices: 0,
  aiAuditPayloads: 0,
  aiProviderCredentials: 0,
  aiRuns: 0,
  total: 0,
};

function credentialIssues(
  credentials: readonly ConfigurationDoctorCredential[],
) {
  return credentials.flatMap((credential) => {
    if (credential.status === "invalid") {
      return [`credential_invalid:${credential.name}`];
    }
    if (credential.required && credential.status !== "present") {
      return [`credential_missing:${credential.name}`];
    }
    return [];
  });
}

function hasCredential(
  credentials: readonly ConfigurationDoctorCredential[],
  name: string,
) {
  return credentials.some(
    (credential) => credential.name === name && credential.status === "present",
  );
}

export function diagnoseConfiguration(
  input: ConfigurationDoctorInput,
): ConfigurationDoctorReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...credentialIssues(input.credentials));

  if (!input.revisions.activeVersion || !input.revisions.draftVersion) {
    errors.push("configuration_revision_missing");
  }
  if (!input.revisions.activeReadable) {
    if (input.revisions.fallbackVersion) {
      warnings.push("active_revision_using_fallback");
    } else {
      errors.push("configuration_revision_unreadable");
    }
  }

  const runtimes = REQUIRED_CONSUMERS.map((consumer) => {
    const runtime = input.runtimes.find((candidate) =>
      candidate.consumer === consumer
    );
    if (!runtime) {
      errors.push(`runtime_missing:${consumer}`);
      return {
        consumer,
        desiredVersion: null,
        health: "missing" as const,
        hotVersion: null,
        pendingRestart: false,
        restartVersion: null,
        stale: true,
      };
    }

    const stale = input.now.getTime() - runtime.lastSeenAt.getTime() >
      input.staleAfterMs;
    const pendingRestart = runtime.health === "restart_required";
    if (stale) errors.push(`runtime_stale:${consumer}`);
    if (runtime.health === "recovery_required") {
      errors.push(`runtime_recovery_required:${consumer}`);
    } else if (runtime.health === "degraded") {
      warnings.push(`runtime_degraded:${consumer}`);
    }
    if (pendingRestart) {
      warnings.push(`runtime_restart_required:${consumer}`);
    }
    return {
      consumer,
      desiredVersion: runtime.desiredVersion,
      health: runtime.health,
      hotVersion: runtime.hotVersion,
      pendingRestart,
      restartVersion: runtime.restartVersion,
      stale,
    };
  });

  if (input.unsupportedSecrets.total > 0) {
    errors.push("unsupported_secret_versions");
  }
  if (
    input.legacySecrets.adminMfaDevices > 0 &&
    !hasCredential(input.credentials, "anonresume.legacy-admin-mfa-key")
  ) {
    errors.push("legacy_admin_key_required");
  }
  if (
    input.legacySecrets.aiAuditPayloads +
      input.legacySecrets.aiProviderCredentials +
      input.legacySecrets.aiRuns > 0 &&
    !hasCredential(
      input.credentials,
      "anonresume.legacy-ai-credentials-key",
    )
  ) {
    errors.push("legacy_ai_key_required");
  }

  const issues = [...new Set([...errors, ...warnings])];
  const status = errors.length > 0
    ? "error"
    : warnings.length > 0
      ? "warning"
      : "healthy";

  return {
    credentials: input.credentials.map((credential) => ({ ...credential })),
    exitCode: status === "error" ? 1 : status === "warning" ? 2 : 0,
    issues,
    legacySecrets: { ...input.legacySecrets },
    revisions: {
      activeVersion: input.revisions.activeVersion,
      draftVersion: input.revisions.draftVersion,
      fallbackVersion: input.revisions.fallbackVersion,
    },
    runtimes,
    status,
    unsupportedSecrets: { ...input.unsupportedSecrets },
  };
}

export function diagnoseUnavailableConfiguration(
  credentials: ConfigurationDoctorCredential[],
  stateIssue = "configuration_state_unavailable",
): ConfigurationDoctorReport {
  const issues = credentialIssues(credentials);
  if (issues.length === 0) issues.push(stateIssue);
  return {
    credentials: credentials.map((credential) => ({ ...credential })),
    exitCode: 1,
    issues,
    legacySecrets: { ...EMPTY_SECRET_COUNTS },
    revisions: {
      activeVersion: null,
      draftVersion: null,
      fallbackVersion: null,
    },
    runtimes: [],
    status: "error",
    unsupportedSecrets: { ...EMPTY_SECRET_COUNTS },
  };
}

function versionLabel(version: number | null) {
  return version === null ? "none" : `v${version}`;
}

export function formatConfigurationDoctorReport(
  report: ConfigurationDoctorReport,
) {
  const lines = [
    `status: ${report.status}`,
    "credentials:",
    ...report.credentials.map((credential) =>
      `- ${credential.name}: ${credential.status}${
        credential.required ? " (required)" : ""
      }`
    ),
    `revisions: active=${versionLabel(report.revisions.activeVersion)} draft=${
      versionLabel(report.revisions.draftVersion)
    } fallback=${versionLabel(report.revisions.fallbackVersion)}`,
    "runtimes:",
    ...report.runtimes.map((runtime) =>
      `- ${runtime.consumer}: desired=${versionLabel(
        runtime.desiredVersion,
      )} hot=${versionLabel(runtime.hotVersion)} restart=${versionLabel(
        runtime.restartVersion,
      )} health=${runtime.health} stale=${runtime.stale}`
    ),
    `legacy-secrets: total=${report.legacySecrets.total}`,
    `unsupported-secret-versions: total=${report.unsupportedSecrets.total}`,
    `issues: ${report.issues.length > 0 ? report.issues.join(",") : "none"}`,
  ];
  return lines.join("\n");
}
