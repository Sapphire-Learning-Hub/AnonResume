import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { restrictStandaloneOutput } from "../../../../scripts/diagnostics/standalone";

it("removes workspace and environment artifacts while preserving runtime output", async () => {
  const root = await mkdtemp(join(tmpdir(), "standalone-private-"));
  try {
    const standalone = join(root, "standalone");
    await mkdir(join(standalone, "tmp"), { recursive: true });
    await mkdir(join(standalone, ".next/server"), { recursive: true });
    for (const name of [".env.production", "compose.env", "tmp/manifest.json", "operator-notes.txt"])
      await writeFile(join(standalone, name), "private fixture");
    await writeFile(join(standalone, "server.js"), "runtime");
    await writeFile(join(standalone, ".next/server/app.js"), "bundle");
    await restrictStandaloneOutput(root);
    for (const name of [".env.production", "compose.env", "tmp", "operator-notes.txt"])
      await expect(stat(join(standalone, name))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(standalone, "server.js"), "utf8")).toBe("runtime");
    expect(await readFile(join(standalone, ".next/server/app.js"), "utf8")).toBe("bundle");
  } finally { await rm(root, { recursive: true, force: true }); }
});
