import { getDatabasePool } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db/schema";
import { DiagnosticRepository } from "@/lib/observability/diagnostics/store/repository";
import { DiagnosticRecorder } from "@/lib/observability/diagnostics/store/buffer";
import { createDiagnosticContext, runWithDiagnosticContext } from "@/lib/observability/diagnostics/context";
import { diagnosticFilterSchema, type DiagnosticBatch } from "@/lib/observability/diagnostics/store/schema";

describe("durable built-in diagnostics", () => {
  const policy = { enabled: true, retentionDays: 7, maxRecords: 50_000, pendingTtlMs: 86_400_000 };
  let repository: DiagnosticRepository;
  beforeAll(() => { repository = new DiagnosticRepository(getDatabasePool(), getDatabaseSchemaName()); });
  afterEach(async () => {
    await getDatabasePool().query(`DELETE FROM "${getDatabaseSchemaName()}".diagnostic_operations`);
  });
  it("preserves causes and late stages idempotently and finds original request and task references", async () => {
    const batches: DiagnosticBatch[] = [];
    const recorder = new DiagnosticRecorder({ identity: { role: "ai-worker", instance: "test", release: "test", build: "test", environment: "test" }, write: async (batch) => { batches.push(batch); await repository.write(batch, policy); } });
    const context = createDiagnosticContext(crypto.randomUUID());
    const taskId = crypto.randomUUID();
    await runWithDiagnosticContext(context, () => recorder.stage("app.ai.execute", async () => {
      recorder.task(taskId, "ai", "active");
      recorder.log("error", "anonresume.ai", "run_failed", { transactionId: taskId, error: { message: "secret", code: "timeout", digest: "a".repeat(16) } });
      await recorder.stage("app.ai.review.round", async () => undefined);
      recorder.task(taskId, "ai", "failure");
    }, taskId));
    await recorder.flush();
    for (const batch of batches) await repository.write(batch, policy);
    const result = await repository.list(diagnosticFilterSchema.parse({ q: taskId }), policy);
    expect(result.items).toHaveLength(1);
    const detail = await repository.details(result.items[0]!.id, policy);
    expect(detail?.events.some((event) => event.name === "app.ai.review.round")).toBe(true);
    expect(detail?.fault.error?.code).toBe("timeout");
    expect(JSON.stringify(detail)).not.toContain("secret");
    expect((await repository.list(diagnosticFilterSchema.parse({ q: context.originRequestId }), policy)).items).toHaveLength(1);
  });
  it("does not discard a shared operation while another task is active, or remove an existing fault on success", async () => {
    const batches: DiagnosticBatch[] = [];
    const context = createDiagnosticContext();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    const recorder = new DiagnosticRecorder({ identity: { role: "web", instance: "test", release: "test", build: "test", environment: "test" }, write: async (batch) => { batches.push(batch); } });
    await runWithDiagnosticContext(context, () => recorder.stage("app.http.request", async () => {
      recorder.task(ids[0]!, "pdf", "active"); recorder.task(ids[1]!, "pdf", "active");
      recorder.task(ids[0]!, "pdf", "success");
    }));
    await recorder.flush();
    for (const batch of batches) await repository.write(batch, policy);
    await repository.prune(policy);
    const remaining = await getDatabasePool().query(`SELECT count(*)::int AS n FROM "${getDatabaseSchemaName()}".diagnostic_operations WHERE id=$1`, [context.diagnosticId]);
    expect(remaining.rows[0].n).toBe(1);
  });
  it("hides expired faults and enforces the occurrence capacity during maintenance", async () => {
    const recorder = new DiagnosticRecorder({ identity: { role: "web", instance: "test", release: "test", build: "test", environment: "test" }, write: (batch) => repository.write(batch, policy) });
    for (let index = 0; index < 3; index++) {
      await runWithDiagnosticContext(createDiagnosticContext(), () => recorder.stage("app.http.request", async () => recorder.log("error", "anonresume.http", "http_request_completed", { statusCode: 500 })));
    }
    await recorder.flush();
    await repository.prune({ ...policy, maxRecords: 1 });
    expect((await repository.list(diagnosticFilterSchema.parse({}), policy)).items).toHaveLength(1);
    await getDatabasePool().query(`UPDATE "${getDatabaseSchemaName()}".diagnostic_operations SET expires_at=now()-interval '1 second'`);
    expect((await repository.list(diagnosticFilterSchema.parse({}), policy)).items).toHaveLength(0);
  });
  it("upgrades a missing map later and retains resolved positions after repeated raw writes", async () => {
    const batches: DiagnosticBatch[] = [];
    const recorder = new DiagnosticRecorder({ identity: { role: "web", instance: "test", release: "test", build: "build-1", environment: "test" }, write: async (batch) => { batches.push(batch); } });
    recorder.log("error", "anonresume.runtime", "operation_failed", { error: { message: "private", stackTrace: "at .next/server/chunks/a.js:1:1", digest: "a".repeat(16) } });
    await recorder.flush();
    const batch = batches[0]!;
    const fault = batch.events.find((event) => event.kind === "fault")!;
    const generated = { asset: ".next/server/chunks/a.js", line: 1, column: 1 };
    const missing = { version: 1 as const, build: "build-1", generated, status: "missing_artifact" as const, original: null, assetDigest: null };
    const mapped = { ...missing, status: "mapped" as const, original: { source: "src/lib/example.ts", line: 8, column: 2 }, assetDigest: "a".repeat(64) };
    fault.locations = [missing];
    await repository.write(batch, policy);
    fault.locations = [mapped];
    await repository.write(batch, policy);
    expect((await repository.details(fault.id, policy))?.fault.locations).toEqual([mapped]);
    delete fault.locations;
    await repository.write(batch, policy);
    expect((await repository.details(fault.id, policy))?.fault.locations).toEqual([mapped]);
    await repository.saveLocations({ ...fault, locations: [missing] });
    expect((await repository.details(fault.id, policy))?.fault.locations).toEqual([mapped]);
  });
});
