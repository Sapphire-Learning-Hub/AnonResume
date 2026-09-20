import type { ConfigKeyring } from "@/lib/config/crypto";
import {
  CONFIG_REGISTRY,
  getManagedConfigDefaults,
  managedConfigSchema,
  type ConfigKey,
  type ManagedConfig,
} from "@/lib/config/registry";
import {
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  readActiveConfigSnapshot,
  updateConfigurationDraft,
} from "@/lib/config/store";

type LegacyEnvironment = Record<string, string | undefined>;
export type LegacyEnvironmentStatus =
  | "import"
  | "unchanged"
  | "ignored"
  | "missing"
  | "invalid";

export interface LegacyEnvironmentEntry {
  environmentKey: string;
  status: LegacyEnvironmentStatus;
}

export interface LegacyManagedConfigResolution {
  entries: LegacyEnvironmentEntry[];
  issues: readonly string[];
  valid: boolean;
  values: Partial<ManagedConfig>;
}

const DEPLOYMENT_ONLY_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "ANONRESUME_DB_SCHEMA",
  "ANONRESUME_SUPER_ADMIN_EMAIL",
  "ADMIN_MFA_ENCRYPTION_KEY",
  "AI_CREDENTIALS_ENCRYPTION_KEY",
  "CONFIG_MASTER_KEY",
  "CONFIG_MASTER_KEY_PREVIOUS",
  "CREDENTIALS_DIRECTORY",
] as const;

export const LEGACY_MANAGED_ENVIRONMENT_KEYS = Object.fromEntries(
  (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).map((key) => [
    CONFIG_REGISTRY[key].environmentKey!,
    key,
  ]),
) as Record<string, ConfigKey>;

export class LegacyEnvironmentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("legacy_environment_invalid");
    this.name = "LegacyEnvironmentValidationError";
  }
}

export class LegacyEnvironmentImportConflictError extends Error {
  constructor() {
    super("legacy_environment_import_conflict");
    this.name = "LegacyEnvironmentImportConflictError";
  }
}

function parseEnvironmentValue(key: ConfigKey, rawValue: string) {
  const defaultValue = CONFIG_REGISTRY[key].defaultValue;
  if (typeof defaultValue === "boolean") {
    if (rawValue === "true") return true;
    if (rawValue === "false") return false;
    throw new Error("invalid_boolean");
  }
  if (typeof defaultValue === "number") {
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value)) throw new Error("invalid_integer");
    return value;
  }
  if (Array.isArray(defaultValue)) {
    return rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return rawValue;
}

export function resolveLegacyManagedConfig(
  environment: LegacyEnvironment,
): LegacyManagedConfigResolution {
  const values: Record<string, unknown> = {};
  const entries: LegacyEnvironmentEntry[] = [];
  const issues: string[] = [];

  for (const [environmentKey, key] of Object.entries(
    LEGACY_MANAGED_ENVIRONMENT_KEYS,
  )) {
    const rawValue = environment[environmentKey];
    if (rawValue === undefined) {
      entries.push({ environmentKey, status: "missing" });
      continue;
    }

    try {
      values[key] = parseEnvironmentValue(key, rawValue);
      entries.push({ environmentKey, status: "import" });
    } catch {
      entries.push({ environmentKey, status: "invalid" });
      issues.push(`${environmentKey}:invalid`);
    }
  }

  for (const environmentKey of DEPLOYMENT_ONLY_ENVIRONMENT_KEYS) {
    if (environment[environmentKey] !== undefined) {
      entries.push({ environmentKey, status: "ignored" });
    }
  }

  const parsed = managedConfigSchema.safeParse({
    ...getManagedConfigDefaults(),
    ...values,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      issues.push(`${String(key)}:invalid`);
      const environmentKey =
        typeof key === "string"
          ? CONFIG_REGISTRY[key as ConfigKey]?.environmentKey
          : undefined;
      const entry = entries.find(
        (candidate) => candidate.environmentKey === environmentKey,
      );
      if (entry && entry.status === "import") entry.status = "invalid";
    }
  }

  return {
    entries,
    issues: [...new Set(issues)],
    valid: issues.length === 0 && parsed.success,
    values: values as Partial<ManagedConfig>,
  };
}

export function formatLegacyEnvironmentPlan(
  entries: readonly LegacyEnvironmentEntry[],
) {
  return entries
    .map((entry) => `${entry.environmentKey}: ${entry.status}`)
    .join("\n");
}

export async function importLegacyManagedConfig(input: {
  actorUserId: string;
  apply?: boolean;
  environment: LegacyEnvironment;
  keyring: ConfigKeyring;
  replaceActive?: boolean;
}) {
  const resolved = resolveLegacyManagedConfig(input.environment);
  if (!resolved.valid) {
    throw new LegacyEnvironmentValidationError(resolved.issues);
  }

  const active = await readActiveConfigSnapshot({ keyring: input.keyring });
  if (active.lastError && active.desiredRevisionId) {
    throw new LegacyEnvironmentImportConflictError();
  }
  const changedKeys = (Object.keys(resolved.values) as ConfigKey[]).filter(
    (key) => JSON.stringify(resolved.values[key]) !== JSON.stringify(active.values[key]),
  );
  const changed = new Set(changedKeys);
  const entries = resolved.entries.map((entry) => {
    const key = LEGACY_MANAGED_ENVIRONMENT_KEYS[entry.environmentKey];
    return entry.status === "import" && key && !changed.has(key)
      ? { ...entry, status: "unchanged" as const }
      : entry;
  });

  if (!input.apply || changedKeys.length === 0) {
    return {
      activeVersion: active.version,
      applied: false,
      changedKeys,
      entries,
    };
  }
  if ((active.version ?? 0) > 1 && !input.replaceActive) {
    throw new LegacyEnvironmentImportConflictError();
  }

  await ensureConfigurationState({ keyring: input.keyring });
  const state = await getConfigurationState({ keyring: input.keyring });
  const values = Object.fromEntries(
    changedKeys.map((key) => [key, resolved.values[key]]),
  ) as Partial<ManagedConfig>;
  await updateConfigurationDraft({
    actorUserId: input.actorUserId,
    baseVersion: state.activeRevision.version,
    draftRevisionId: state.draftRevision.id,
    keyring: input.keyring,
    values,
  });
  const published = await publishConfigurationDraft({
    actorUserId: input.actorUserId,
    baseVersion: state.activeRevision.version,
    draftRevisionId: state.draftRevision.id,
    keyring: input.keyring,
  });

  return {
    activeVersion: published.version,
    applied: true,
    changedKeys,
    entries,
  };
}
