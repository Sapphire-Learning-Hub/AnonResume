import {
  readBootstrapConfig,
  validateBootstrapConfiguration,
} from "@/lib/config/bootstrap";
import { createDatabasePoolOptions } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db/schema";

const masterKey = Buffer.alloc(32, 7).toString("base64");

function requiredCredentials(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    "anonresume.application-origin": "https://resume.example.com",
    "anonresume.auth-secret": "a".repeat(32),
    "anonresume.config-master-key": masterKey,
    "anonresume.database-url": "postgresql://credential/db",
    ...overrides,
  };
}

describe("bootstrap configuration provider", () => {
  it("prefers named credentials over compatibility environment values", () => {
    const credentials = requiredCredentials();
    const result = readBootstrapConfig({
      environment: {
        DATABASE_URL: "postgresql://legacy/db",
        NODE_ENV: "production",
      },
      readCredential: (name) => credentials[name],
    });

    expect(result.databaseUrl).toBe("postgresql://credential/db");
    expect(result.applicationOrigin).toBe("https://resume.example.com");
    expect(result.currentMasterKey).toEqual(Buffer.alloc(32, 7));
  });

  it("rejects a missing production master key with a stable issue code", () => {
    const credentials = requiredCredentials();
    delete credentials["anonresume.config-master-key"];

    expect(() =>
      readBootstrapConfig({
        environment: { NODE_ENV: "production" },
        readCredential: (name) => credentials[name],
      }),
    ).toThrow("config_master_key_missing");
  });

  it("loads optional previous keys and schema credentials", () => {
    const credentials = requiredCredentials({
      "anonresume.config-master-key-previous": Buffer.alloc(32, 3).toString(
        "base64",
      ),
      "anonresume.database-schema": "anonresume_runtime",
    });

    const result = readBootstrapConfig({
      environment: { NODE_ENV: "production" },
      readCredential: (name) => credentials[name],
    });

    expect(result.previousMasterKey).toEqual(Buffer.alloc(32, 3));
    expect(result.databaseSchema).toBe("anonresume_runtime");
  });

  it("loads migration-only legacy encryption credentials", () => {
    const credentials = requiredCredentials({
      "anonresume.legacy-admin-mfa-key": Buffer.alloc(32, 4).toString(
        "base64",
      ),
      "anonresume.legacy-ai-credentials-key": Buffer.alloc(32, 5).toString(
        "base64",
      ),
    });

    const result = readBootstrapConfig({
      environment: { NODE_ENV: "production" },
      readCredential: (name) => credentials[name],
    });

    expect(result.legacyAdminMfaKey).toEqual(Buffer.alloc(32, 4));
    expect(result.legacyAiCredentialsKey).toEqual(Buffer.alloc(32, 5));
  });

  it("does not invent database or master-key credentials in development", () => {
    expect(() =>
      readBootstrapConfig({
        environment: { NODE_ENV: "development" },
        readCredential: () => undefined,
      }),
    ).toThrow("database_url_missing");
  });

  it("routes database and schema consumers through credential-backed bootstrap values", () => {
    const credentials = requiredCredentials({
      "anonresume.database-schema": "credential_schema",
    });
    const bootstrapInput = {
      environment: {
        ANONRESUME_DB_SCHEMA: "legacy_schema",
        DATABASE_URL: "postgresql://legacy/db",
        NODE_ENV: "production",
      },
      readCredential: (name: string) => credentials[name],
    };

    expect(createDatabasePoolOptions(bootstrapInput)).toEqual({
      connectionString: "postgresql://credential/db",
    });
    expect(getDatabaseSchemaName(bootstrapInput)).toBe("credential_schema");
  });

  it("reports every missing production trust root with stable issue codes", () => {
    expect(validateBootstrapConfiguration({
      environment: { NODE_ENV: "production" },
      readCredential: () => undefined,
    })).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        "database_url_missing",
        "application_origin_missing",
        "auth_secret_missing",
        "config_master_key_missing",
      ]),
    });
  });
});
