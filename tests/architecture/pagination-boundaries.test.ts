import { readFileSync, readdirSync } from "node:fs";
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

describe("pagination architecture", () => {
  it("does not expose legacy unbounded resume-list repository functions", () => {
    const repository = readFileSync(
      resolve(root, "src/lib/resume-repository.ts"),
      "utf8",
    );

    expect(repository).not.toContain("function listResumeEntries");
    expect(repository).not.toContain("function listResumeVersionSnapshots");
  });

  it("does not call growth-capable management list queries without a request", () => {
    const unboundedCall =
      /listAdmin(?:Users|ResumeMetadata|Exports|Roles|Administrators|AuditEvents|Workers)\(\s*\)/;
    const offenders = listSourceFiles("src").filter((file) =>
      unboundedCall.test(readFileSync(resolve(root, file), "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
