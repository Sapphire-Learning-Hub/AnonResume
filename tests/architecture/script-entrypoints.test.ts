import { access, readFile } from "node:fs/promises";
import path from "node:path";

interface PackageManifest {
  scripts?: Record<string, string>;
}

it("keeps local package script entrypoints valid", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), "package.json"), "utf8"),
  ) as PackageManifest;
  const entrypoints = Object.values(manifest.scripts ?? {}).flatMap(
    (command) => command.match(/(?:src|scripts)\/[\w./-]+\.[cm]?[jt]s/g) ?? [],
  );

  await expect(
    Promise.all(
      [...new Set(entrypoints)].map((entrypoint) =>
        access(path.join(process.cwd(), entrypoint)),
      ),
    ),
  ).resolves.toBeDefined();
});
