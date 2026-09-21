import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEPLOYMENT_SECRET_FILES,
  initializeDeploymentSecrets,
} from "@/lib/runtime/deployment-secrets";

describe("deployment secret initialization", () => {
  it("generates a complete internally consistent secret set once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anonresume-secrets-"));
    const generated = await initializeDeploymentSecrets({
      directory,
      databaseHost: "postgres",
      databaseName: "anonresume",
      databaseUser: "anonresume",
      randomBytes: (size) => Buffer.alloc(size, 7),
    });

    expect(generated).toEqual({ state: "created" });
    const password = await readFile(
      join(directory, DEPLOYMENT_SECRET_FILES.databasePassword),
      "utf8",
    );
    const databaseUrl = await readFile(
      join(directory, DEPLOYMENT_SECRET_FILES.databaseUrl),
      "utf8",
    );
    expect(databaseUrl).toBe(
      `postgresql://anonresume:${password}@postgres:5432/anonresume`,
    );
    expect(
      await readFile(join(directory, DEPLOYMENT_SECRET_FILES.authSecret), "utf8"),
    ).toHaveLength(64);
    expect(
      Buffer.from(
        await readFile(
          join(directory, DEPLOYMENT_SECRET_FILES.configMasterKey),
          "utf8",
        ),
        "base64",
      ),
    ).toHaveLength(32);

    await expect(
      initializeDeploymentSecrets({ directory }),
    ).resolves.toEqual({ state: "existing" });
  });

  it("refuses to fill a partially initialized secret directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anonresume-secrets-"));
    await writeFile(
      join(directory, DEPLOYMENT_SECRET_FILES.authSecret),
      "existing",
    );

    await expect(
      initializeDeploymentSecrets({ directory }),
    ).rejects.toThrow("partially initialized");
  });

  it("escapes custom database identifiers in the generated connection URL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "anonresume-secrets-"));
    await initializeDeploymentSecrets({
      directory,
      databaseName: "resume/data",
      databaseUser: "resume@example.com",
      randomBytes: (size) => Buffer.alloc(size, 7),
    });

    const databaseUrl = await readFile(
      join(directory, DEPLOYMENT_SECRET_FILES.databaseUrl),
      "utf8",
    );
    expect(databaseUrl).toContain("postgresql://resume%40example.com:");
    expect(databaseUrl).toContain("@postgres:5432/resume%2Fdata");
  });
});
