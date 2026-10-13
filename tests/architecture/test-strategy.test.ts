import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function listTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTestFiles(entryPath);
    return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("test strategy", () => {
  it("keeps end-to-end browser tests out of the repository", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["test:e2e"]).toBeUndefined();
    expect(existsSync(resolve(root, "playwright.config.ts"))).toBe(false);
    expect(existsSync(resolve(root, "tests/e2e"))).toBe(false);
  });

  it("does not coordinate asynchronous tests with real-time sleeps", () => {
    const offenders = listTestFiles(resolve(root, "tests"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("setTimeout(") && !source.includes("vi.useFakeTimers()");
      })
      .map((file) => file.slice(root.length + 1));

    expect(offenders).toEqual([]);
  });
});
