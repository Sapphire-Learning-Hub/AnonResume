import { Pool } from "pg";
import { createDatabasePoolOptions } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db/schema";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";
import { readLoggingConfiguration } from "@/lib/observability/logging/config";
import { applicationBuildId } from "@/lib/config/build-metadata";
import type { ConfigConsumer } from "@/lib/config/types";
import { DiagnosticRepository } from "./repository";
import { DiagnosticRecorder } from "./buffer";
import type { StoreState } from "./runtime";
import { diagnosticSymbolicator } from "@/lib/observability/diagnostics/sourcemaps/symbolicator";

export function startDiagnosticWriter(state: StoreState, role: ConfigConsumer) {
  const pool = new Pool({ ...createDatabasePoolOptions(), max: 1, connectionTimeoutMillis: 750, idleTimeoutMillis: 5000, statement_timeout: 1500, query_timeout: 2000, allowExitOnIdle: true });
  pool.on("error", () => undefined);
  const repository = new DiagnosticRepository(pool, getDatabaseSchemaName());
  state.close = () => pool.end();
  const identity = resolveRuntimeIdentity(role);
  const release = resolveReleaseMetadata();
  let lastWarning = 0;
  let retryAfter = 0;
  const warn = () => {
    if (Date.now()-lastWarning < 60_000) return;
    lastWarning = Date.now();
    process.stderr.write('{"event.action":"diagnostic_store_write_failed","log.level":"warn","message":"Built-in diagnostics degraded; server logs remain available"}\n');
  };
  state.recorder = new DiagnosticRecorder({
    identity: { role, instance: identity.instanceId, build: applicationBuildId === "development" ? release.commit ?? "development" : applicationBuildId, release: release.tag, environment: readLoggingConfiguration().environment },
    write: async (batch) => {
      if (!state.policy?.enabled) return;
      if (Date.now()<retryAfter) throw new Error("diagnostic_store_backoff");
      try {
        const events = [];
        for (const event of batch.events) events.push(await diagnosticSymbolicator().enrich(event));
        await repository.write({ ...batch, events }, state.policy);
      }
      catch (error) { retryAfter=Date.now()+1000; warn(); throw error; }
    },
  });
  let cleaning = false;
  const clean = async () => {
    if (!state.policy || cleaning) return;
    cleaning = true;
    try { await repository.prune(state.policy); }
    catch { warn(); }
    finally { cleaning = false; }
  };
  state.timer = setInterval(() => { void clean(); }, 60_000);
  state.timer.unref();
  void clean();
}
