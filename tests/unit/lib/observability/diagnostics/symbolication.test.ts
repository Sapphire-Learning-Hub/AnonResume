import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { privatizeSourceMaps } from "../../../../../scripts/diagnostics/source-maps";
import { DiagnosticSymbolicator } from "@/lib/observability/diagnostics/sourcemaps/symbolicator";
import { diagnosticEventSchema } from "@/lib/observability/diagnostics/store/schema";

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "ar-symbols-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
async function archive(mappings = "AAGE") {
  const next = path.join(root, "next");
  await mkdir(path.join(next, "static"), { recursive: true });
  await writeFile(path.join(next, "static/a.js"), "throw Error()\n//# sourceMappingURL=a.js.map");
  await writeFile(path.join(next, "static/a.js.map"), JSON.stringify({ version: 3, sources: ["turbopack:///[project]/src/components/example.tsx"], names: [], mappings, sourcesContent: ["PRIVATE_SOURCE"] }));
  await privatizeSourceMaps(next, path.join(root, "build-1"), "build-1", null);
}
function event() {
  return diagnosticEventSchema.parse({ id: crypto.randomUUID(), parentId: null, requestId: null, taskId: null, kind: "fault", name: "browser_error_reported", source: "browser", outcome: "failure", at: new Date().toISOString(), durationMs: null,
    identity: { role: "web", instance: "web-1", build: "newer-build", release: "test", environment: "test" }, error: null,
    reference: { clientBuild: "build-1", digest: null, clientFrames: [{ asset: "/_next/static/a.js", line: 1, column: 1 }] } });
}
it("resolves the browser's own build and retains only safe positions, not source content", async () => {
  await archive();
  const result = await new DiagnosticSymbolicator(root).enrich(event());
  expect(result.locations?.[0]).toMatchObject({ status: "mapped", build: "build-1", original: { source: "src/components/example.tsx", line: 4, column: 3 } });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_SOURCE");
  await rm(path.join(root, "build-1"), { recursive: true });
  expect((await new DiagnosticSymbolicator(root).enrich(result)).locations).toEqual(result.locations);
});
it("returns deliberate fallbacks for absent, tampered or hostile artifacts without losing the fault", async () => {
  const mapper = new DiagnosticSymbolicator(root);
  expect((await mapper.enrich(event())).locations?.[0]?.status).toBe("missing_artifact");
  await archive();
  const manifest = JSON.parse(await readFile(path.join(root, "build-1/manifest.json"), "utf8"));
  await writeFile(path.join(root, "build-1", manifest.assets[0].map), "corrupt");
  expect((await new DiagnosticSymbolicator(root).enrich(event())).locations?.[0]?.status).toBe("invalid_artifact");
  const hostile = event(); hostile.reference!.clientBuild = "../build-1";
  expect((await mapper.enrich(hostile)).locations?.[0]?.status).toBe("invalid_artifact");
});
it("rejects archive escapes and cannot map an unrelated asset or out-of-range location", async () => {
  await archive();
  const other = await mkdtemp(path.join(tmpdir(), "ar-outside-"));
  try {
    await symlink(other, path.join(root, "outside"));
    await writeFile(path.join(other, "manifest.json"), "{}");
    const value = event(); value.reference!.clientBuild = "outside";
    expect((await new DiagnosticSymbolicator(root).enrich(value)).locations?.[0]?.status).toBe("invalid_artifact");
    value.reference!.clientBuild = "build-1";
    value.reference!.clientFrames[0]!.asset = "/_next/static/other.js";
    expect((await new DiagnosticSymbolicator(root).enrich(value)).locations?.[0]?.status).toBe("asset_missing");
    value.reference!.clientFrames[0] = { asset: "/_next/static/a.js", line: 99, column: 1 };
    expect((await new DiagnosticSymbolicator(root).enrich(value)).locations?.[0]?.status).toBe("unmapped");
  } finally { await rm(other, { recursive: true, force: true }); }
});
it("maps server chunks using server identity and distinguishes already-native source frames", async () => {
  await archive();
  const file = path.join(root, "build-1/manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.assets.push({ ...manifest.assets[0], asset: ".next/server/chunks/example.js" });
  await writeFile(file, JSON.stringify(manifest));
  const value = event(); value.source = "runtime"; value.identity.build = "build-1";
  value.error = { type: "Error", code: null, fingerprint: "a".repeat(16), category: "application", causes: [], frames: ["at .next/server/chunks/example.js:1:1", "at scripts/ai-worker.ts:42:3"] };
  const result = await new DiagnosticSymbolicator(root).enrich(value);
  expect(result.locations?.[0]).toMatchObject({ status: "mapped", original: { source: "src/components/example.tsx", line: 4, column: 3 } });
  expect(result.locations?.[1]).toMatchObject({ status: "source", original: { source: "scripts/ai-worker.ts", line: 42, column: 3 } });
});
it("keeps invalid zero-based runtime coordinates as raw evidence without rejecting the fault", async () => {
  const value = event(); value.source = "runtime";
  value.error = { type: "Error", code: null, fingerprint: "a".repeat(16), category: "application", causes: [], frames: ["at .next/server/chunks/a.js:0:0", "at src/lib/example.ts:0:0"] };
  const result = await new DiagnosticSymbolicator(root).enrich(value);
  expect(diagnosticEventSchema.safeParse(result).success).toBe(true);
  expect(result.error?.frames).toEqual(value.error.frames);
  expect(result.locations).toEqual([]);
});
it("does not let an invalid original position in an artifact reject the fault record", async () => {
  await archive("AADA");
  const result = await new DiagnosticSymbolicator(root).enrich(event());
  expect(diagnosticEventSchema.safeParse(result).success).toBe(true);
  expect(result.locations?.[0]).toMatchObject({ status: "unmapped", original: null });
});
