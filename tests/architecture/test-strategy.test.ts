import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("test strategy", () => {
  it("keeps end-to-end browser tests out of the repository", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["test:e2e"]).toBeUndefined();
    expect(existsSync(resolve(root, "playwright.config.ts"))).toBe(false);
    expect(existsSync(resolve(root, "tests/e2e"))).toBe(false);
  });
});
