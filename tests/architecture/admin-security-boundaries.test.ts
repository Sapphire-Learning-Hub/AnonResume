import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function listSourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return listSourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    },
  );
}

describe("admin security architecture", () => {
  it("does not expose the removed admin route namespace", () => {
    expect(existsSync(resolve(root, "src/app/admin"))).toBe(false);

    const oldPathPattern = /["'`]\/admin(?:\/|[?"'`])/;
    const offenders = [
      ...listSourceFiles("src"),
      ...listSourceFiles("scripts"),
    ].filter((file) =>
      oldPathPattern.test(readFileSync(resolve(root, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps direct Better Auth session access behind the shared session boundary", () => {
    const files = listSourceFiles("src");
    const offenders = files.filter((file) => {
      if (file === "src/lib/auth/session.ts") return false;
      return readFileSync(resolve(root, file), "utf8").includes("auth.api.getSession");
    });

    expect(offenders).toEqual([]);
  });

  it("authorizes every protected management route on the server", () => {
    const publicRoutes = new Set([
      "src/app/api/manage/activation/complete/route.ts",
      "src/app/api/manage/activation/start/route.ts",
      "src/app/api/manage/session/route.ts",
    ]);
    const routes = listSourceFiles("src/app/api/manage").filter((file) =>
      file.endsWith("/route.ts"),
    );
    const offenders = routes.filter((file) => {
      if (publicRoutes.has(file)) return false;
      return !readFileSync(resolve(root, file), "utf8").includes("requireAdminApi(");
    });

    expect(offenders).toEqual([]);
  });

  it("requires recent management MFA for sensitive AI administration", () => {
    const sensitiveRoutes = [
      "src/app/api/manage/ai/providers/route.ts",
      "src/app/api/manage/ai/providers/[id]/route.ts",
      "src/app/api/manage/ai/providers/[id]/models/[modelId]/route.ts",
      "src/app/api/manage/ai/quotas/route.ts",
      "src/app/api/manage/ai/usage/route.ts",
      "src/app/api/manage/ai/audit/[runId]/route.ts",
    ];

    for (const file of sensitiveRoutes) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source, file).toContain("recentMfa: true");
    }
  });

  it("keeps management cookies secure across shared pages and APIs", () => {
    const requestBoundary = readFileSync(
      resolve(root, "src/lib/admin/request.ts"),
      "utf8",
    );
    expect(requestBoundary).toContain('path: "/"');
    expect(requestBoundary).toContain("httpOnly: true");
    expect(requestBoundary).toContain('sameSite: "strict"');
  });

  it("runs the singleton super-admin preflight before development and production servers", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["admin:bootstrap"]).toBe(
      "bun run scripts/admin-bootstrap.ts",
    );
    expect(packageJson.scripts?.start).toBe(
      "bun run scripts/admin-bootstrap.ts production && next start",
    );
    expect(packageJson.scripts?.dev).toBe(
      "bun run scripts/admin-bootstrap.ts development && next dev",
    );
    const bootstrapScript = readFileSync(
      resolve(root, "scripts/admin-bootstrap.ts"),
      "utf8",
    );
    expect(bootstrapScript).toContain("bootstrapConfiguredSuperAdmin");
    expect(bootstrapScript).toContain("closeEmailTransporter");
  });
});
