import type {
  RuntimeRestartCoordinator,
  RuntimeRestartDrainRequest,
} from "@/lib/runtime/restart/coordinator";
import {
  startWebRestartRuntime,
  startWorkerRestartRuntime,
} from "@/lib/runtime/restart/process-runtime";
import { initializeLogCapture } from "../../../../support/observability";

function restartRequest() {
  return {
    consumer: "web" as const,
    expectedSessionId: "old-session",
    instanceId: "test/web/web-1",
    markAwaitingStartup: vi.fn(async () => true),
    markExiting: vi.fn(async () => true),
    operationId: "operation-1",
  };
}

function coordinator(
  request: RuntimeRestartDrainRequest = restartRequest(),
) {
  return {
    poll: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    waitForDrainRequest: vi.fn(async () => request),
  } as unknown as RuntimeRestartCoordinator;
}

describe("managed restart process runtime", () => {
  it("delays the Web termination signal until the initiating response can finish", async () => {
    const request = restartRequest();
    const runtimeCoordinator = coordinator(request);
    let finishShutdown!: () => void;
    const shutdownFinished = new Promise<void>((resolve) => {
      finishShutdown = resolve;
    });
    const beforeSignal = vi.fn(() => shutdownFinished);
    const signalProcess = vi.fn();
    let scheduled: (() => void) | undefined;

    const runtime = await startWebRestartRuntime({
      beforeSignal,
      coordinator: runtimeCoordinator,
      responseGraceMs: 1_000,
      schedule(callback, delay) {
        expect(delay).toBe(1_000);
        scheduled = callback;
      },
      signalProcess,
      supervisor: {
        kind: "docker-compose",
        reasonCode: null,
        restartSupported: true,
      },
    });

    await vi.waitFor(() => expect(request.markExiting).toHaveBeenCalled());
    expect(signalProcess).not.toHaveBeenCalled();

    scheduled?.();
    await vi.waitFor(() => expect(beforeSignal).toHaveBeenCalled());
    expect(signalProcess).not.toHaveBeenCalled();
    finishShutdown();
    await vi.waitFor(() => {
      expect(request.markAwaitingStartup).toHaveBeenCalled();
      expect(signalProcess).toHaveBeenCalledWith("SIGTERM");
    });

    await runtime.stop();
  });

  it("does not arm Web termination without a verified supervisor", async () => {
    const runtimeCoordinator = coordinator();
    const signalProcess = vi.fn();

    const runtime = await startWebRestartRuntime({
      coordinator: runtimeCoordinator,
      signalProcess,
      supervisor: {
        kind: "container",
        reasonCode: "restart_policy_unverified",
        restartSupported: false,
      },
    });

    expect(runtimeCoordinator.start).not.toHaveBeenCalled();
    expect(signalProcess).not.toHaveBeenCalled();
    await runtime.stop();
  });

  it("lets a worker finish active work before recording exit", async () => {
    const capture = initializeLogCapture("ai-worker");
    const request = {
      ...restartRequest(),
      consumer: "ai-worker" as const,
      instanceId: "test/ai-worker/ai-1",
    };
    const runtimeCoordinator = coordinator(request);
    const abort = vi.fn();
    let finishWork!: () => void;
    const activeWork = new Promise<void>((resolve) => {
      finishWork = resolve;
    });

    const running = startWorkerRestartRuntime({
      abort,
      consumer: "ai-worker",
      coordinator: runtimeCoordinator,
      supervisor: {
        kind: "systemd",
        reasonCode: null,
        restartSupported: true,
      },
      work: () => activeWork,
    });

    await vi.waitFor(() => expect(abort).toHaveBeenCalled());
    expect(request.markExiting).not.toHaveBeenCalled();

    finishWork();
    await running;

    expect(request.markExiting).toHaveBeenCalled();
    expect(request.markAwaitingStartup).toHaveBeenCalled();
    expect(runtimeCoordinator.stop).toHaveBeenCalled();
    expect(capture.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "event.action": "restart_drain_started",
          "event.dataset": "anonresume.runtime",
          "event.outcome": "success",
          "transaction.id": "operation-1",
        }),
        expect.objectContaining({
          "event.action": "restart_awaiting_startup",
          "event.dataset": "anonresume.runtime",
          "event.outcome": "success",
          "transaction.id": "operation-1",
        }),
      ]),
    );
  });

  it("runs a worker normally when online restart is unsupported", async () => {
    const runtimeCoordinator = coordinator();
    const abort = vi.fn();
    const work = vi.fn(async () => undefined);

    await startWorkerRestartRuntime({
      abort,
      consumer: "pdf-worker",
      coordinator: runtimeCoordinator,
      supervisor: {
        kind: "manual",
        reasonCode: "supervisor_unavailable",
        restartSupported: false,
      },
      work,
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
    expect(runtimeCoordinator.start).not.toHaveBeenCalled();
  });
});
