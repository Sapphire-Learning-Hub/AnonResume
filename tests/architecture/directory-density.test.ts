import { readdir } from "node:fs/promises";
import path from "node:path";

const MAX_DIRECT_TYPESCRIPT_FILES = 20;

async function findOvercrowdedDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const directTypeScriptFiles = entries.filter(
    (entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name),
  );
  const nestedResults = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findOvercrowdedDirectories(path.join(directory, entry.name))),
  );
  const current =
    directTypeScriptFiles.length > MAX_DIRECT_TYPESCRIPT_FILES
      ? [`${path.relative(process.cwd(), directory)} (${directTypeScriptFiles.length})`]
      : [];

  return [...current, ...nestedResults.flat()];
}

it("keeps source and unit-test directories grouped by responsibility", async () => {
  const overcrowded = (
    await Promise.all([
      findOvercrowdedDirectories(path.join(process.cwd(), "src")),
      findOvercrowdedDirectories(path.join(process.cwd(), "tests/unit")),
    ])
  ).flat();

  expect(overcrowded).toEqual([]);
});
