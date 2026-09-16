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

describe("application feedback architecture", () => {
  it("keeps transient feedback behind the shared application context", () => {
    const files = listSourceFiles("src");
    const directMessageHooks = files.filter((file) =>
      readFileSync(resolve(root, file), "utf8").includes("message.useMessage("),
    );

    expect(directMessageHooks).toEqual([]);
    expect(
      readFileSync(resolve(root, "src/app/StyleRegistry.tsx"), "utf8"),
    ).toContain("<AntdApp");
  });

  it("only permits inline alerts in explicitly owned contextual surfaces", () => {
    const allowed = new Set([
      "src/components/announcements/AnnouncementBanner.tsx",
      "src/components/dashboard/ResumeMarkdownImportDialog.tsx",
    ]);
    const offenders = listSourceFiles("src").filter((file) => {
      if (allowed.has(file)) return false;
      return /<Alert\b/.test(readFileSync(resolve(root, file), "utf8"));
    });

    expect(offenders).toEqual([]);
  });
});
