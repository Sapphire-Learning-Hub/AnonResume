import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const ROUTE_EXEMPTIONS = new Map<string, string>();

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

function exportedMethods(source: string) {
  return HTTP_METHODS.filter((method) =>
    [
      `export\\s+(?:(?:async\\s+)?function\\s+${method}\\b|const\\s+${method}\\s*=)`,
      `export\\s*\\{[^}]*\\b(?:[A-Za-z_$][\\w$]*\\s+as\\s+)?${method}\\b[^}]*\\}`,
    ].some((pattern) => new RegExp(pattern).test(source))
  );
}

describe("observability boundaries", () => {
  it("requires every API handler export to use request logging", async () => {
    const routeFiles = (await listTypescriptFiles("src/app/api"))
      .filter((file) => file.endsWith(`${path.sep}route.ts`));
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      for (const method of exportedMethods(source)) {
        const wrappedExport = new RegExp(
          `export\\s+const\\s+${method}\\s*=\\s*withRequestLogging\\(`,
        );
        if (!wrappedExport.test(source) && !ROUTE_EXEMPTIONS.has(file)) {
          offenders.push(`${file}:${method}`);
        }
      }
    }

    expect(routeFiles.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("keeps server observability modules out of client components", async () => {
    const sourceFiles = await listTypescriptFiles("src");
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      if (
        /^\s*["']use client["'];/m.test(source) &&
        /from\s+["']@\/lib\/observability(?:\/[^"']*)?["']/.test(source)
      ) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
