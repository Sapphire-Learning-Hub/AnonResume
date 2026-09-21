import { randomBytes as secureRandomBytes } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEPLOYMENT_SECRET_FILES = {
  authSecret: "auth-secret",
  configMasterKey: "config-master-key",
  databasePassword: "database-password",
  databaseUrl: "database-url",
} as const;

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeDeploymentSecrets(input: {
  directory: string;
  databaseHost?: string;
  databasePort?: number;
  databaseName?: string;
  databaseUser?: string;
  randomBytes?: (size: number) => Buffer;
}): Promise<{ state: "created" | "existing" }> {
  const files = Object.values(DEPLOYMENT_SECRET_FILES);
  await mkdir(input.directory, { recursive: true, mode: 0o755 });
  const presence = await Promise.all(
    files.map((file) => exists(join(input.directory, file))),
  );
  if (presence.every(Boolean)) return { state: "existing" };
  if (presence.some(Boolean)) {
    throw new Error("Deployment secret directory is partially initialized");
  }

  const randomBytes = input.randomBytes ?? secureRandomBytes;
  const password = randomBytes(32).toString("base64url");
  const databaseHost = input.databaseHost ?? "postgres";
  const databasePort = input.databasePort ?? 5432;
  const databaseName = input.databaseName ?? "anonresume";
  const databaseUser = input.databaseUser ?? "anonresume";
  const encodedDatabaseName = encodeURIComponent(databaseName);
  const encodedDatabaseUser = encodeURIComponent(databaseUser);
  const values: Record<(typeof files)[number], string> = {
    [DEPLOYMENT_SECRET_FILES.authSecret]: randomBytes(32).toString("hex"),
    [DEPLOYMENT_SECRET_FILES.configMasterKey]: randomBytes(32).toString(
      "base64",
    ),
    [DEPLOYMENT_SECRET_FILES.databasePassword]: password,
    [DEPLOYMENT_SECRET_FILES.databaseUrl]:
      `postgresql://${encodedDatabaseUser}:${password}@${databaseHost}:${databasePort}/${encodedDatabaseName}`,
  };

  for (const file of files) {
    const temporary = join(input.directory, `.${file}.tmp`);
    await writeFile(temporary, values[file], { flag: "wx", mode: 0o444 });
    await rename(temporary, join(input.directory, file));
  }

  return { state: "created" };
}
