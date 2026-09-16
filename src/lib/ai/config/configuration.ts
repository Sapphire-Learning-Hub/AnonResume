type AiEnvironment = Record<string, string | undefined>;

const DEFAULTS = {
  auditRetentionDays: 30,
  streamCheckpointMs: 1_000,
  runLeaseSeconds: 90,
  requestsPerMinute: 10,
  maxConcurrentRuns: 1,
  defaultMonthlyPoints: 100_000,
} as const;

function booleanValue(
  environment: AiEnvironment,
  key: string,
  fallback: boolean,
) {
  const raw = environment[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function positiveInteger(
  environment: AiEnvironment,
  key: string,
  fallback: number,
) {
  const raw = environment[key]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

export function decodeAiCredentialsEncryptionKey(value: string | undefined) {
  if (!value?.trim()) return undefined;

  const supplied = value.trim().replace(/=+$/, "");
  const decoded = Buffer.from(value.trim(), "base64");
  const canonical = decoded.toString("base64").replace(/=+$/, "");

  return decoded.length === 32 && canonical === supplied ? decoded : undefined;
}

export function resolveAiConfiguration(environment: AiEnvironment) {
  const enabled = booleanValue(environment, "AI_ENABLED", false);
  const platformEnabled = booleanValue(
    environment,
    "AI_PLATFORM_ENABLED",
    false,
  );
  const byokEnabled = booleanValue(environment, "AI_BYOK_ENABLED", false);
  const credentialsEncryptionKey = decodeAiCredentialsEncryptionKey(
    environment.AI_CREDENTIALS_ENCRYPTION_KEY,
  );

  if (enabled && !credentialsEncryptionKey) {
    throw new Error(
      "AI_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return {
    enabled,
    platformEnabled: enabled && platformEnabled,
    byokEnabled: enabled && byokEnabled,
    credentialsEncryptionKey,
    auditRetentionDays: positiveInteger(
      environment,
      "AI_AUDIT_RETENTION_DAYS",
      DEFAULTS.auditRetentionDays,
    ),
    streamCheckpointMs: positiveInteger(
      environment,
      "AI_STREAM_CHECKPOINT_MS",
      DEFAULTS.streamCheckpointMs,
    ),
    runLeaseSeconds: positiveInteger(
      environment,
      "AI_RUN_LEASE_SECONDS",
      DEFAULTS.runLeaseSeconds,
    ),
    requestsPerMinute: positiveInteger(
      environment,
      "AI_REQUESTS_PER_MINUTE",
      DEFAULTS.requestsPerMinute,
    ),
    maxConcurrentRuns: positiveInteger(
      environment,
      "AI_MAX_CONCURRENT_RUNS",
      DEFAULTS.maxConcurrentRuns,
    ),
    defaultMonthlyPoints: positiveInteger(
      environment,
      "AI_DEFAULT_MONTHLY_POINTS",
      DEFAULTS.defaultMonthlyPoints,
    ),
  };
}
