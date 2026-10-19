import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { manifestSchema, type Artifact } from "@/lib/observability/diagnostics/sourcemaps/manifest";
const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error("source_map_symlink_rejected");
    const file = path.join(root, item.name);
    if (item.isDirectory()) result.push(...(await files(file)));
    else result.push(file);
  }
  return result;
}

export async function privatizeSourceMaps(
  nextRoot: string,
  output: string,
  buildId: string,
  commit: string | null,
) {
  const staticRoot = path.join(nextRoot, "static");
  const assets: Artifact[] = [];
  await mkdir(output, { recursive: true, mode: 0o700 });
  const staticFiles = await files(staticRoot);
  let serverFiles: string[] = [];
  try { serverFiles = await files(path.join(nextRoot, "server")); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  const allFiles = [...staticFiles, ...serverFiles];
  const available = new Set(allFiles);
  for (const file of allFiles) {
    if (file.endsWith(".js")) {
      const asset = await readFile(file);
      // Turbopack hashes map names independently of the JavaScript asset.
      const reference = asset
        .toString("utf8")
        .match(/\/\/# sourceMappingURL=([^\s/]+\.map)\s*$/)?.[1];
      const mapPath = reference && !reference.includes("..")
        ? path.join(path.dirname(file), decodeURIComponent(reference)) : `${file}.map`;
      if (!available.has(mapPath)) continue;
      const map = await readFile(mapPath);
      const mapDigest = hash(map);
      await writeFile(path.join(output, `${mapDigest}.map`), map, {
        mode: 0o600,
      });
      assets.push({
        asset: staticFiles.includes(file) ? `/_next/static/${path.relative(staticRoot, file).split(path.sep).join("/")}` : `.next/${path.relative(nextRoot, file).split(path.sep).join("/")}`,
        assetDigest: hash(asset),
        map: `${mapDigest}.map`,
        mapDigest,
      });
    }
  }
  for (const file of staticFiles) if (file.endsWith(".map")) await unlink(file);
  // A standalone copy may already contain the static tree. Never leave a public duplicate.
  try {
    for (const file of await files(
      path.join(nextRoot, "standalone", ".next", "static"),
    ))
      if (file.endsWith(".map")) await unlink(file);
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
  }
  if (!assets.length) throw new Error("private_source_maps_missing");
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifestSchema.parse({ version: 2, buildId, commit, assets })),
    { mode: 0o600 },
  );
}
