import { readFileSync } from "node:fs";
import { join } from "node:path";

type BootstrapEnvironment = Record<string, string | undefined>;

export interface BootstrapConfigInput {
  environment?: BootstrapEnvironment;
  readCredential?: (name: string) => string | undefined;
}

export interface BootstrapConfigurationStatus {
  valid: boolean;
  issues: readonly string[];
}

export type BootstrapNodeEnvironment =
  | "development"
  | "production"
  | "test";

export const BOOTSTRAP_CREDENTIAL_NAMES = {
  applicationOrigin: "anonresume.application-origin",
  authSecret: "anonresume.auth-secret",
  currentMasterKey: "anonresume.config-master-key",
  databaseSchema: "anonresume.database-schema",
  databaseUrl: "anonresume.database-url",
  legacyAdminMfaKey: "anonresume.legacy-admin-mfa-key",
  legacyAiCredentialsKey: "anonresume.legacy-ai-credentials-key",
  previousMasterKey: "anonresume.config-master-key-previous",
  superAdminEmail: "anonresume.super-admin-email",
} as const;

export interface BootstrapCredentialInspection {
  name: string;
  required: boolean;
  status: "absent" | "invalid" | "missing" | "present";
}

export interface BootstrapConfig {
  applicationOrigin: string;
  authSecret: string;
  currentMasterKey: Buffer;
  databaseSchema: string;
  databaseUrl: string;
  legacyAdminMfaKey?: Buffer;
  legacyAiCredentialsKey?: Buffer;
  previousMasterKey?: Buffer;
}

export class BootstrapConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join(","));
    this.name = "BootstrapConfigurationError";
  }
}

function readSystemdCredential(
  name: string,
  environment: BootstrapEnvironment,
) {
  const directory = environment.CREDENTIALS_DIRECTORY?.trim();
  if (!directory) return undefined;

  try {
    return readFileSync(join(directory, name), "utf8").trimEnd();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function readBootstrapValue(
  input: BootstrapConfigInput,
  name: keyof typeof BOOTSTRAP_CREDENTIAL_NAMES,
  environmentKey: string,
) {
  const environment = input.environment ?? process.env;
  const readCredential = input.readCredential ??
    ((credentialName: string) =>
      readSystemdCredential(credentialName, environment));
  return readCredential(BOOTSTRAP_CREDENTIAL_NAMES[name]) ??
    environment[environmentKey];
}

export function readBootstrapDatabaseUrl(input: BootstrapConfigInput = {}) {
  const value = readBootstrapValue(input, "databaseUrl", "DATABASE_URL")?.trim();
  if (!value) throw new BootstrapConfigurationError(["database_url_missing"]);
  if (!validDatabaseUrl(value)) {
    throw new BootstrapConfigurationError(["database_url_invalid"]);
  }
  return value;
}

export function readBootstrapDatabaseSchema(
  input: BootstrapConfigInput = {},
) {
  const value =
    readBootstrapValue(input, "databaseSchema", "ANONRESUME_DB_SCHEMA")
      ?.trim() || "public";
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new BootstrapConfigurationError(["database_schema_invalid"]);
  }
  return value;
}

function decodeMasterKey(value: string | undefined) {
  if (!value) return undefined;
  const decoded = Buffer.from(value.trim(), "base64");
  return decoded.length === 32 ? decoded : undefined;
}

function validDatabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}

function validApplicationOrigin(value: string | undefined, production: boolean) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (!production || url.protocol === "https:") &&
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}

export function getBootstrapNodeEnvironment(
  input: BootstrapConfigInput = {},
): BootstrapNodeEnvironment {
  const value = (input.environment ?? process.env).NODE_ENV;
  if (value === "production" || value === "test") return value;
  return "development";
}

export function resolveBootstrapApplicationOrigin(
  input: BootstrapConfigInput = {},
) {
  const value = readBootstrapValue(
    input,
    "applicationOrigin",
    "BETTER_AUTH_URL",
  )?.trim();
  if (!value) return "http://localhost:3000";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? url.origin
      : "http://localhost:3000";
  } catch {
    return "http://localhost:3000";
  }
}

export function readBootstrapConfig(
  input: BootstrapConfigInput = {},
): BootstrapConfig {
  const environment = input.environment ?? process.env;
  const readCredential = input.readCredential ??
    ((name: string) => readSystemdCredential(name, environment));
  const read = (
    name: keyof typeof BOOTSTRAP_CREDENTIAL_NAMES,
    environmentKey: string,
  ) => readCredential(BOOTSTRAP_CREDENTIAL_NAMES[name]) ??
    environment[environmentKey];
  const production = environment.NODE_ENV === "production";
  const databaseUrl = read("databaseUrl", "DATABASE_URL")?.trim();
  const applicationOrigin = read("applicationOrigin", "BETTER_AUTH_URL")?.trim();
  const authSecret =
    read("authSecret", "BETTER_AUTH_SECRET")?.trim() ||
    (production ? undefined : "anonresume-development-secret-2026-08-28");
  const currentMasterKeyValue = read("currentMasterKey", "CONFIG_MASTER_KEY");
  const previousMasterKeyValue = read(
    "previousMasterKey",
    "CONFIG_MASTER_KEY_PREVIOUS",
  );
  const legacyAdminMfaKeyValue = read(
    "legacyAdminMfaKey",
    "ADMIN_MFA_ENCRYPTION_KEY",
  );
  const legacyAiCredentialsKeyValue = read(
    "legacyAiCredentialsKey",
    "AI_CREDENTIALS_ENCRYPTION_KEY",
  );
  const currentMasterKey = decodeMasterKey(currentMasterKeyValue);
  const previousMasterKey = decodeMasterKey(previousMasterKeyValue);
  const legacyAdminMfaKey = decodeMasterKey(legacyAdminMfaKeyValue);
  const legacyAiCredentialsKey = decodeMasterKey(
    legacyAiCredentialsKeyValue,
  );
  const databaseSchema =
    read("databaseSchema", "ANONRESUME_DB_SCHEMA")?.trim() || "public";
  const issues: string[] = [];

  if (!databaseUrl) issues.push("database_url_missing");
  else if (!validDatabaseUrl(databaseUrl)) issues.push("database_url_invalid");
  if (!applicationOrigin) issues.push("application_origin_missing");
  else if (!validApplicationOrigin(applicationOrigin, production)) {
    issues.push("application_origin_invalid");
  }
  if (!authSecret) issues.push("auth_secret_missing");
  else if (authSecret.length < 32 || authSecret.includes("replace_with")) {
    issues.push("auth_secret_invalid");
  }
  if (!currentMasterKeyValue) issues.push("config_master_key_missing");
  else if (!currentMasterKey) issues.push("config_master_key_invalid");
  if (previousMasterKeyValue && !previousMasterKey) {
    issues.push("config_master_key_previous_invalid");
  }
  if (legacyAdminMfaKeyValue && !legacyAdminMfaKey) {
    issues.push("legacy_admin_mfa_key_invalid");
  }
  if (legacyAiCredentialsKeyValue && !legacyAiCredentialsKey) {
    issues.push("legacy_ai_credentials_key_invalid");
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(databaseSchema)) {
    issues.push("database_schema_invalid");
  }

  if (issues.length > 0) throw new BootstrapConfigurationError(issues);

  return {
    applicationOrigin: new URL(applicationOrigin!).origin,
    authSecret: authSecret!,
    currentMasterKey: currentMasterKey!,
    databaseSchema,
    databaseUrl: databaseUrl!,
    ...(legacyAdminMfaKey ? { legacyAdminMfaKey } : {}),
    ...(legacyAiCredentialsKey ? { legacyAiCredentialsKey } : {}),
    ...(previousMasterKey ? { previousMasterKey } : {}),
  };
}

export function inspectBootstrapCredentials(
  input: BootstrapConfigInput = {},
): BootstrapCredentialInspection[] {
  const environment = input.environment ?? process.env;
  const production = environment.NODE_ENV === "production";
  const definitions = [
    {
      key: "databaseUrl" as const,
      environmentKey: "DATABASE_URL",
      required: true,
      valid: validDatabaseUrl,
    },
    {
      key: "applicationOrigin" as const,
      environmentKey: "BETTER_AUTH_URL",
      required: true,
      valid: (value: string | undefined) =>
        validApplicationOrigin(value, production),
    },
    {
      key: "authSecret" as const,
      environmentKey: "BETTER_AUTH_SECRET",
      required: true,
      valid: (value: string | undefined) =>
        Boolean(value && value.trim().length >= 32 && !value.includes(
          "replace_with",
        )),
    },
    {
      key: "currentMasterKey" as const,
      environmentKey: "CONFIG_MASTER_KEY",
      required: true,
      valid: (value: string | undefined) => Boolean(decodeMasterKey(value)),
    },
    {
      key: "databaseSchema" as const,
      environmentKey: "ANONRESUME_DB_SCHEMA",
      required: false,
      valid: (value: string | undefined) =>
        Boolean(value && /^[a-z_][a-z0-9_]*$/i.test(value.trim())),
    },
    {
      key: "previousMasterKey" as const,
      environmentKey: "CONFIG_MASTER_KEY_PREVIOUS",
      required: false,
      valid: (value: string | undefined) => Boolean(decodeMasterKey(value)),
    },
    {
      key: "legacyAdminMfaKey" as const,
      environmentKey: "ADMIN_MFA_ENCRYPTION_KEY",
      required: false,
      valid: (value: string | undefined) => Boolean(decodeMasterKey(value)),
    },
    {
      key: "legacyAiCredentialsKey" as const,
      environmentKey: "AI_CREDENTIALS_ENCRYPTION_KEY",
      required: false,
      valid: (value: string | undefined) => Boolean(decodeMasterKey(value)),
    },
    {
      key: "superAdminEmail" as const,
      environmentKey: "ANONRESUME_SUPER_ADMIN_EMAIL",
      required: false,
      valid: (value: string | undefined) =>
        Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())),
    },
  ];

  return definitions.map((definition) => {
    const value = readBootstrapValue(
      input,
      definition.key,
      definition.environmentKey,
    )?.trim();
    return {
      name: BOOTSTRAP_CREDENTIAL_NAMES[definition.key],
      required: definition.required,
      status: !value
        ? definition.required ? "missing" as const : "absent" as const
        : definition.valid(value) ? "present" as const : "invalid" as const,
    };
  });
}

export function validateBootstrapConfiguration(
  input: BootstrapConfigInput = {},
): BootstrapConfigurationStatus {
  const environment = input.environment ?? process.env;
  if (environment.NODE_ENV !== "production") {
    return { valid: true, issues: [] };
  }

  try {
    readBootstrapConfig(input);
    return { valid: true, issues: [] };
  } catch (error) {
    if (error instanceof BootstrapConfigurationError) {
      return { valid: false, issues: error.issues };
    }
    throw error;
  }
}
