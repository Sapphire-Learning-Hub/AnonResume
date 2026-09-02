import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);

      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );

  return nested.flat();
}

describe("source boundaries", () => {
  it("keeps tests outside production and tooling directories", async () => {
    const root = process.cwd();
    const files = [
      ...(await listFiles(path.join(root, "src"))),
      ...(await listFiles(path.join(root, "scripts"))),
    ];
    const colocatedTests = files.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file));

    expect(colocatedTests).toEqual([]);
  });

  it("does not import test modules from production code", async () => {
    const sourceFiles = (await listFiles(path.join(process.cwd(), "src"))).filter(
      (file) => /\.[jt]sx?$/.test(file),
    );
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = await readFile(file, "utf8");

      if (/from\s+["'][^"']*tests?\//.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
