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

const CREDENTIAL_NAMES = {
  applicationOrigin: "anonresume.application-origin",
  authSecret: "anonresume.auth-secret",
  currentMasterKey: "anonresume.config-master-key",
  databaseSchema: "anonresume.database-schema",
  databaseUrl: "anonresume.database-url",
  previousMasterKey: "anonresume.config-master-key-previous",
} as const;

export interface BootstrapConfig {
  applicationOrigin: string;
  authSecret: string;
  currentMasterKey: Buffer;
  databaseSchema: string;
  databaseUrl: string;
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
  name: keyof typeof CREDENTIAL_NAMES,
  environmentKey: string,
) {
  const environment = input.environment ?? process.env;
  const readCredential = input.readCredential ??
    ((credentialName: string) =>
      readSystemdCredential(credentialName, environment));
  return readCredential(CREDENTIAL_NAMES[name]) ?? environment[environmentKey];
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

export function readBootstrapConfig(
  input: BootstrapConfigInput = {},
): BootstrapConfig {
  const environment = input.environment ?? process.env;
  const readCredential = input.readCredential ??
    ((name: string) => readSystemdCredential(name, environment));
  const read = (name: keyof typeof CREDENTIAL_NAMES, environmentKey: string) =>
    readCredential(CREDENTIAL_NAMES[name]) ?? environment[environmentKey];
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
  const currentMasterKey = decodeMasterKey(currentMasterKeyValue);
  const previousMasterKey = decodeMasterKey(previousMasterKeyValue);
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
    ...(previousMasterKey ? { previousMasterKey } : {}),
  };
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
