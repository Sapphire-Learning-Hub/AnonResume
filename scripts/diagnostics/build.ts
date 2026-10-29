import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";
import { spawn } from "node:child_process";
import { privatizeSourceMaps } from "./source-maps";
import { restrictStandaloneOutput } from "./standalone";

const buildId = crypto.randomUUID();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      ANONRESUME_PRIVATE_MAP_BUILD: "1",
      ANONRESUME_BUILD_ID: buildId,
    },
    stdio: "inherit",
  },
);
const status = await new Promise<number>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
if (status !== 0) process.exit(status);
await restrictStandaloneOutput(".next");
await privatizeSourceMaps(
  ".next",
  `.anonresume/diagnostics/${buildId}`,
  buildId,
  resolveReleaseMetadata().commit,
);
console.info(
  "Private diagnostics artifacts saved; public source maps removed.",
);
