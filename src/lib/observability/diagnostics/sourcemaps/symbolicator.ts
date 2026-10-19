import path from "node:path";
import { realpath } from "node:fs/promises";
import type { DiagnosticEvent } from "@/lib/observability/diagnostics/store/schema";
import { readDiagnosticArtifactsDirectory } from "@/lib/config/process-environment";
import { buildKeySchema, type SourceManifest } from "./manifest";
import { readManifest, readPrivateMap, originalLocation } from "./reader";
import type { DiagnosticLocation } from "./schema";

const successful = (location: DiagnosticLocation) => location.status === "mapped" || location.status === "source";
export class DiagnosticSymbolicator {
  private manifests = new Map<string, SourceManifest>();
  private maps = new Map<string, Awaited<ReturnType<typeof readPrivateMap>>>();
  private size = 0;
  constructor(private readonly root: string) {}
  private async resolve(build: string, generated: DiagnosticLocation["generated"]): Promise<DiagnosticLocation> {
    const result: DiagnosticLocation = { version: 1, build, generated, status: "unmapped", original: null, assetDigest: null };
    if (/^(?:src|scripts|node_modules)\//.test(generated.asset) && !generated.asset.split("/").includes("..")) {
      return { ...result, status: "source", original: { source: generated.asset, line: generated.line, column: generated.column } };
    }
    if (!buildKeySchema.safeParse(build).success || !/^(?:\/_next\/static\/|\.next\/server\/)[a-zA-Z0-9_./@+()[\]-]+\.js$/.test(generated.asset) || generated.asset.split("/").includes("..")) return { ...result, status: "invalid_artifact" };
    try {
      const root = await realpath(this.root);
      const directory = await realpath(path.join(root, build));
      const manifestPath = await realpath(path.join(directory, "manifest.json"));
      if (path.dirname(directory) !== root || path.dirname(manifestPath) !== directory) throw new Error("source_map_path_rejected");
      let manifest = this.manifests.get(build);
      if (!manifest) {
        manifest = await readManifest(manifestPath, build);
        if (this.manifests.size >= 4) this.manifests.delete(this.manifests.keys().next().value!);
        this.manifests.set(build, manifest);
      }
      const artifact = manifest.assets.find((asset) => asset.asset === generated.asset);
      if (!artifact) return { ...result, status: "asset_missing" };
      result.assetDigest = artifact.assetDigest;
      let entry = this.maps.get(artifact.mapDigest);
      if (!entry) {
        entry = await readPrivateMap(directory, artifact);
        while (this.size + entry.bytes > 67_108_864 && this.maps.size) {
          const oldest = this.maps.keys().next().value!;
          this.size -= this.maps.get(oldest)!.bytes; this.maps.delete(oldest);
        }
        this.maps.set(artifact.mapDigest, entry); this.size += entry.bytes;
      }
      result.original = originalLocation(entry.map, generated.line, generated.column);
      if (result.original) result.status = "mapped";
      return result;
    } catch (error) {
      return { ...result, status: error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? "missing_artifact" : "invalid_artifact" };
    }
  }
  async enrich(event: DiagnosticEvent): Promise<DiagnosticEvent> {
    if (event.kind !== "fault") return event;
    const build = event.source === "browser" ? event.reference?.clientBuild ?? "unknown" : event.identity.build;
    const frames = event.source === "browser" ? event.reference?.clientFrames ?? [] : (event.error?.frames ?? []).flatMap((frame) => {
      const match = frame.match(/^at (.+):(\d+):(\d+)$/);
      if (!match || Number(match[2]) < 1 || Number(match[3]) < 1) return [];
      return [{ asset: match[1]!, line: Number(match[2]), column: Number(match[3]) }];
    });
    const locations: DiagnosticLocation[] = [];
    for (const frame of frames.slice(0, 16)) {
      const previous = event.locations?.find((value) => value.build === build && value.generated.asset === frame.asset && value.generated.line === frame.line && value.generated.column === frame.column && successful(value));
      locations.push(previous ?? await this.resolve(build, frame));
    }
    return { ...event, locations };
  }
}
let singleton: DiagnosticSymbolicator | undefined;
export function diagnosticSymbolicator() {
  return singleton ??= new DiagnosticSymbolicator(path.resolve(readDiagnosticArtifactsDirectory()));
}
