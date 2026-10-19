import { createDiagnosticContext, runWithDiagnosticContext } from "@/lib/observability/diagnostics/context";
import { DiagnosticRecorder } from "@/lib/observability/diagnostics/store/buffer";
import type { DiagnosticBatch } from "@/lib/observability/diagnostics/store/schema";

function setup() {
  const batches: DiagnosticBatch[] = [];
  const recorder = new DiagnosticRecorder({
    identity: { role: "web", instance: "test-web", build: "build-test", release: "test", environment: "test" },
    write: async (batch) => { batches.push(structuredClone(batch)); },
  });
  return { recorder, batches };
}

describe("built-in fault recording", () => {
  it("discards successful requests but retains the preceding stages of a failure", async () => {
    const { recorder, batches } = setup();
    await runWithDiagnosticContext(createDiagnosticContext(), () => recorder.stage("app.http.request", async () => {
      await recorder.stage("app.email.send", async () => undefined);
    }));
    await recorder.flush();
    expect(batches).toHaveLength(0);
    const diagnostic = createDiagnosticContext();
    await runWithDiagnosticContext(diagnostic, () => recorder.stage("app.http.request", async () => {
      await recorder.stage("app.email.send", async () => undefined);
      recorder.log("error", "anonresume.http", "http_request_failed", { error: { message: "private password hunter2", type: "Error", digest: "a".repeat(16) }, outcome: "failure" });
    }));
    await recorder.flush();
    expect(batches.at(-1)?.diagnosticId).toBe(diagnostic.diagnosticId);
    expect(batches.flatMap((batch) => batch.events).some((event) => event.name === "app.email.send")).toBe(true);
    expect(JSON.stringify(batches)).not.toContain("hunter2");
    expect(batches.flatMap((batch) => batch.events).some((event) => event.kind === "fault")).toBe(true);
  });

  it("does not promote ordinary client errors and keeps concurrent requests separate", async () => {
    const { recorder, batches } = setup();
    const good = createDiagnosticContext();
    const bad = createDiagnosticContext();
    await Promise.all([
      runWithDiagnosticContext(good, () => recorder.stage("app.http.request", async () => {
        await Promise.resolve();
        recorder.log("warn", "anonresume.http", "http_request_completed", { statusCode: 400, outcome: "failure" });
      })),
      runWithDiagnosticContext(bad, () => recorder.stage("app.http.request", async () => {
        recorder.log("error", "anonresume.http", "http_request_completed", { statusCode: 503, outcome: "failure" });
      })),
    ]);
    await recorder.flush();
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((batch) => batch.diagnosticId === bad.diagnosticId)).toBe(true);
  });

  it("bounds stages and queues without changing a successful business result when storage fails", async () => {
    const recorder = new DiagnosticRecorder({
      identity: { role: "web", instance: "test", build: "test", release: "test", environment: "test" },
      write: async () => { throw new Error("database unavailable"); },
    });
    const value = await runWithDiagnosticContext(createDiagnosticContext(), () => recorder.stage("app.http.request", async () => {
      for (let index = 0; index < 300; index++) await recorder.stage("app.email.send", async () => undefined);
      recorder.log("error", "anonresume.http", "http_request_completed", { statusCode: 500 });
      return 42;
    }));
    await recorder.flush();
    expect(value).toBe(42);
    expect(recorder.health().dropped).toBeGreaterThan(0);
    expect(recorder.health().degraded).toBe(true);
  });

  it("caps pending writes even while the database is stalled", async () => {
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => { release=resolve; });
    const recorder = new DiagnosticRecorder({ identity:{role:"web",instance:"test",build:"test",release:"test",environment:"test"},write:()=>blocked });
    for (let index=0;index<300;index++) recorder.log("error","anonresume.http","http_request_failed",{});
    expect(recorder.health().pending).toBeLessThanOrEqual(128);
    expect(recorder.health().dropped).toBeGreaterThan(0);
    release();
    await recorder.flush();
  });

  it("does not turn cancellation or user stops into system faults", async () => {
    const {recorder,batches}=setup();
    recorder.log("error","anonresume.pdf","export_failed",{labels:{cancelled:true}});
    recorder.log("error","anonresume.ai","resume_review_failed",{labels:{failureCode:"stopped"}});
    await recorder.flush();
    expect(batches).toHaveLength(0);
  });
});
