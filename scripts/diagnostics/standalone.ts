import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

// Next may conservatively trace runtime filesystem paths, or copy loaded .env
// files itself. A distributable must contain runtime output, never the workspace.
const runtimeEntries = new Set([
  ".next", "node_modules", "public", "src", "scripts", "drizzle",
  "package.json", "server.js", "LICENSE", "BRAND-NOTICE.md", "THIRD_PARTY_NOTICES",
]);

export async function restrictStandaloneOutput(nextRoot: string) {
  const root = join(nextRoot, "standalone");
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("standalone_output_invalid");
  for (const entry of await readdir(root)) {
    if (!runtimeEntries.has(entry)) await rm(join(root, entry), { recursive: true });
  }
}
