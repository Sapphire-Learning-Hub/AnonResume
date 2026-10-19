import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { AnyMap, originalPositionFor, type EncodedSourceMap, type SectionedSourceMap } from "@jridgewell/trace-mapping";
import { z } from "zod";
import { manifestSchema, type Artifact, type SourceManifest } from "./manifest";

export const artifactHash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function readArtifact(file: string, limit: number) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error("source_map_size_rejected");
    // Limit the read itself too, including files that grow after stat().
    const bytes = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length-length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > stat.size || length > limit) throw new Error("source_map_size_rejected");
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}
export async function readManifest(file: string, build: string): Promise<SourceManifest> {
  const manifest = manifestSchema.parse(JSON.parse((await readArtifact(file, 16_777_216)).toString("utf8")));
  if (manifest.buildId !== build) throw new Error("source_map_build_mismatch");
  if (new Set(manifest.assets.map((asset) => asset.asset)).size !== manifest.assets.length) throw new Error("source_map_duplicate_asset");
  return manifest;
}
const rawMap: z.ZodType<EncodedSourceMap | SectionedSourceMap> = z.lazy(() => z.union([
  z.object({ version: z.literal(3), sources: z.array(z.string().nullable()).max(100_000), names: z.array(z.string()).max(1_000_000).default([]), mappings: z.string(), sourceRoot: z.string().optional() }),
  z.object({ version: z.literal(3), sections: z.array(z.object({ offset: z.object({ line: z.number().int().nonnegative(), column: z.number().int().nonnegative() }), map: rawMap, url: z.never().optional() })).max(10_000) }),
]));
export async function readPrivateMap(root: string, artifact: Artifact) {
  const base = await realpath(root);
  const file = await realpath(path.join(base, artifact.map));
  if (path.dirname(file) !== base) throw new Error("source_map_path_rejected");
  const bytes = await readArtifact(file, 33_554_432);
  if (artifactHash(bytes) !== artifact.mapDigest) throw new Error("source_map_digest_mismatch");
  // Reject remote indexed sections; never load source content or URLs.
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  return { map: AnyMap(rawMap.parse(raw)), bytes: bytes.length };
}
export function originalLocation(map: ReturnType<typeof AnyMap>, line: number, column: number) {
  if (!Number.isSafeInteger(line) || line < 1 || line > 10_000_000 || !Number.isSafeInteger(column) || column < 1 || column > 1_000_000) return null;
  const result = originalPositionFor(map, { line, column: column - 1 });
  const source = result.source?.replaceAll("\\", "/").match(/(?:^|\/)((?:src|scripts|node_modules)\/[a-zA-Z0-9_./@+()[\]-]+\.[cm]?[jt]sx?)$/)?.[1];
  if (!source || source.length > 512 || source.split("/").includes("..") || result.line === null || result.column === null
    || !Number.isSafeInteger(result.line) || result.line < 1 || !Number.isSafeInteger(result.column) || result.column < 0) return null;
  return { source, line: result.line, column: result.column + 1 };
}

export async function symbolicatePosition(input: { manifest: string; buildId: string; asset: string; assetDigest: string; line: number; column: number }) {
  const file = await realpath(input.manifest);
  const manifest = await readManifest(file, input.buildId);
  const artifact = manifest.assets.find((asset) => asset.asset === input.asset && asset.assetDigest === input.assetDigest);
  if (!artifact) throw new Error("source_map_asset_mismatch");
  return originalLocation((await readPrivateMap(path.dirname(file), artifact)).map, input.line, input.column);
}
