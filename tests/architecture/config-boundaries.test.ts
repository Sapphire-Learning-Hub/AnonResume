import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DIRECT_ENVIRONMENT_ACCESS = /(?:process|Bun)\.env\b/;
const NEXT_PUBLIC_ACCESS = /(?:process|Bun)\.env(?:\.|\[["'])NEXT_PUBLIC_/;
const ALLOWED_ENVIRONMENT_READERS = new Set([
  "scripts/admin-bootstrap.ts",
  "scripts/config-import-env.ts",
  "src/lib/config/bootstrap.ts",
  "src/lib/config/process-environment.ts",
  "src/lib/runtime/release-metadata.ts",
  "src/test/setup.ts",
]);

async function listTypescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(process.cwd(), directory), {
    withFileTypes: true,
  });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypescriptFiles(relativePath);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [relativePath] : [];
  }));
  return files.flat();
}

describe("configuration access boundaries", () => {
  it("routes direct environment access through approved providers", async () => {
    const files = [
      ...(await listTypescriptFiles("src")),
      ...(await listTypescriptFiles("scripts")),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      if (ALLOWED_ENVIRONMENT_READERS.has(file)) continue;
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      if (DIRECT_ENVIRONMENT_ACCESS.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("does not read NEXT_PUBLIC variables from application source", async () => {
    const files = await listTypescriptFiles("src");
    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      if (NEXT_PUBLIC_ACCESS.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
