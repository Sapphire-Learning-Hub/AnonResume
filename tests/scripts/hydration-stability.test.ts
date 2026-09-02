import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

import { getDirectAntStyleNames } from "../../scripts/style-architecture";

const sourceRoot = join(process.cwd(), "src");

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);

      return entry.isDirectory() ? listSourceFiles(path) : [path];
    }),
  );

  return files.flat().filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

describe("hydration-stable Ant Design overrides", () => {
  it("discovers aliased and compound Ant components", () => {
    const source = `
      import { Button as Action, Input } from "antd";

      export function Fixture() {
        return (
          <>
            <Input.TextArea className={styles.editor} />
            <Action rootClassName={styles.action}>Save</Action>
          </>
        );
      }
    `;

    expect(getDirectAntStyleNames(source, "fixture.tsx")).toEqual([
      expect.objectContaining({ styleName: "editor" }),
      expect.objectContaining({ styleName: "action" }),
    ]);
  });

  it("discovers every local style composed onto an Ant component", () => {
    const source = `
      import { Button } from "antd";

      export function Fixture() {
        return (
          <Button className={cx(styles.action, styles.compact)}>Save</Button>
        );
      }
    `;

    expect(getDirectAntStyleNames(source, "fixture.tsx")).toEqual([
      expect.objectContaining({ styleName: "action" }),
      expect.objectContaining({ styleName: "compact" }),
    ]);
  });

  it("gives every class attached directly to an Ant component doubled specificity", async () => {
    const sourceFiles = await listSourceFiles(sourceRoot);
    const sourceByFile = new Map(
      await Promise.all(
        sourceFiles.map(async (path) => [path, await readFile(path, "utf8")] as const),
      ),
    );
    const unsafeOverrides = new Set<string>();

    for (const [usagePath, source] of sourceByFile) {
      for (const { styleName } of getDirectAntStyleNames(source, usagePath)) {
        const localStyleSources = [...sourceByFile]
          .filter(([path]) => dirname(path) === dirname(usagePath))
          .map(([, content]) => content)
          .join("\n");
        const stableDefinitionPattern = new RegExp(
          `\\b${styleName}:\\s*css\\x60\\s*&&`,
        );

        if (!stableDefinitionPattern.test(localStyleSources)) {
          unsafeOverrides.add(
            `${relative(process.cwd(), usagePath)}:${styleName}`,
          );
        }
      }
    }

    expect([...unsafeOverrides]).toEqual([]);
  });
});
