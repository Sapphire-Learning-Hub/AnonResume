import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  privatizeSourceMaps,
} from "../../../../../scripts/diagnostics/source-maps";
import { symbolicatePosition } from "@/lib/observability/diagnostics/sourcemaps/reader";

it("removes deployable maps and refuses wrong builds or tampered private artifacts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "anonresume-maps-"));
  try {
    const next = path.join(root, "next");
    const out = path.join(root, "private");
    await mkdir(path.join(next, "static"), { recursive: true });
    await mkdir(path.join(next, "server/chunks"), { recursive: true });
    await mkdir(path.join(next, "server/app/api/auth/[...all]"), { recursive: true });
    const js = "console.log(1)\n//# sourceMappingURL=different.js.map";
    await writeFile(path.join(next, "static", "a.js"), js);
    await writeFile(
      path.join(next, "static", "different.js.map"),
      JSON.stringify({
        version: 3,
        sources: ["src/app/page.tsx"],
        names: [],
        mappings: "AAAA",
        sourcesContent: ["secret source"],
      }),
    );
    await writeFile(path.join(next, "static", "orphan.js.map"), "obsolete");
    await writeFile(path.join(next, "server/chunks", "server.js"), js);
    await writeFile(path.join(next, "server/chunks", "different.js.map"), JSON.stringify({ version: 3, sources: ["src/lib/example.ts"], names: [], mappings: "AAAA" }));
    await writeFile(path.join(next, "server/app/api/auth/[...all]/route.js"), "export {};");
    await writeFile(path.join(next, "server/app/api/auth/[...all]/route.js.map"), JSON.stringify({ version: 3, sources: ["src/app/api/auth/[...all]/route.ts"], names: [], mappings: "AAAA" }));
    await privatizeSourceMaps(next, out, "build-1", "commit-1");
    await expect(
      access(path.join(next, "static", "different.js.map")),
    ).rejects.toThrow();
    await expect(
      access(path.join(next, "static", "orphan.js.map")),
    ).rejects.toThrow();
    const input = {
      manifest: path.join(out, "manifest.json"),
      buildId: "build-1",
      asset: "/_next/static/a.js",
      assetDigest: createHash("sha256").update(js).digest("hex"),
      line: 1,
      column: 1,
    };
    expect(await symbolicatePosition(input)).toEqual({
      source: "src/app/page.tsx",
      line: 1,
      column: 1,
    });
    expect(await symbolicatePosition({ ...input, asset: ".next/server/chunks/server.js" })).toEqual({ source: "src/lib/example.ts", line: 1, column: 1 });
    await expect(
      symbolicatePosition({ ...input, buildId: "other" }),
    ).rejects.toThrow("build_mismatch");
    await expect(
      symbolicatePosition({ ...input, asset: "/../../private" }),
    ).rejects.toThrow();
    const manifest = JSON.parse(await readFile(input.manifest, "utf8"));
    await writeFile(path.join(out, manifest.assets[0].map), "tampered");
    await expect(symbolicatePosition(input)).rejects.toThrow("digest_mismatch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
