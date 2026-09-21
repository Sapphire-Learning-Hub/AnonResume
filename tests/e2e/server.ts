import { spawn } from "node:child_process";

import { migrateDatabase } from "@/db/migrate";
import { getDatabasePool } from "@/lib/runtime/database";

const port = process.argv[2];
if (!port || !/^\d+$/.test(port)) {
  throw new Error("e2e_server_port_required");
}

await migrateDatabase();
await getDatabasePool().end();

const server = spawn(
  "bun",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", port],
  { env: process.env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}

process.exitCode = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 1));
});
