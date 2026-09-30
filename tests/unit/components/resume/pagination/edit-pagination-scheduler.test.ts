import {
  createEditPaginationScheduler,
  type EditPaginationRevision,
  type EditPaginationWork,
} from "@/components/resume/pagination/edit-pagination-scheduler";

interface FrameHarness {
  cancelFrame: (id: number) => void;
  flushFrame: () => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  scheduledCount: () => number;
}

function createFrameHarness(): FrameHarness {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  return {
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
    flushFrame() {
      const entry = callbacks.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;

      if (!entry) return;

      const [id, callback] = entry;
      callbacks.delete(id);
      callback(0);
    },
    scheduledCount() {
      return callbacks.size;
    },
  };
}

function complete<T>(value: T): EditPaginationWork<T> {
  return {
    run: () => ({ done: true, result: value }),
  };
}

describe("createEditPaginationScheduler", () => {
  let revision: EditPaginationRevision;
  let frames: FrameHarness;

  beforeEach(() => {
    revision = { document: 1, geometry: 1, width: 1 };
    frames = createFrameHarness();
  });

  it("coalesces normal requests and commits only the latest one", async () => {
    const commit = vi.fn();
    const createWork = vi.fn(({ reason }: { reason: string }) => complete(reason));
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork,
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.schedule("input", "normal");
    scheduler.schedule("document", "normal");

    expect(frames.scheduledCount()).toBe(1);
    frames.flushFrame();

    expect(createWork).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();

    await Promise.resolve();
    frames.flushFrame();

    expect(createWork).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("document", {
      reason: "document",
      priority: "normal",
      revision,
      sequence: 2,
    });
  });

  it("lets an immediate request supersede queued normal work", () => {
    const commit = vi.fn();
    const createWork = vi.fn(({ reason }: { reason: string }) => complete(reason));
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork,
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.schedule("input", "normal");
    scheduler.schedule("paste", "immediate");
    frames.flushFrame();

    expect(createWork).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      "paste",
      expect.objectContaining({ reason: "paste", priority: "immediate" }),
    );
  });

  it("pauses during composition and resumes with the latest revision", () => {
    const commit = vi.fn();
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork: ({ revision: workRevision }) => complete(workRevision),
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.setComposing(true);
    scheduler.schedule("input", "normal");
    revision = { document: 4, geometry: 2, width: 1 };
    scheduler.schedule("geometry", "immediate");

    expect(frames.scheduledCount()).toBe(0);

    scheduler.setComposing(false);
    frames.flushFrame();

    expect(commit).toHaveBeenCalledWith(
      revision,
      expect.objectContaining({ reason: "geometry", revision }),
    );
  });

  it("does not commit partial work between frames", async () => {
    const commit = vi.fn();
    let step = 0;
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork: () => ({
        run: () => {
          step += 1;
          return step < 3
            ? { done: false as const }
            : { done: true as const, result: "complete" };
        },
      }),
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.schedule("input", "normal");
    frames.flushFrame();
    expect(commit).not.toHaveBeenCalled();
    await Promise.resolve();
    frames.flushFrame();
    expect(commit).not.toHaveBeenCalled();
    await Promise.resolve();
    frames.flushFrame();
    expect(commit).not.toHaveBeenCalled();
    await Promise.resolve();
    frames.flushFrame();
    expect(commit).toHaveBeenCalledWith(
      "complete",
      expect.objectContaining({ reason: "input" }),
    );
  });

  it("discards completed work when its revision became stale", () => {
    const commit = vi.fn();
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork: () => ({
        run: () => {
          revision = { document: 2, geometry: 1, width: 1 };
          return { done: true, result: "stale" };
        },
      }),
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.schedule("input", "normal");
    frames.flushFrame();

    expect(commit).not.toHaveBeenCalled();
  });

  it("does not recurse when a frame implementation invokes callbacks synchronously", async () => {
    const commit = vi.fn();
    let step = 0;
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork: () => ({
        run: () => {
          step += 1;
          return step === 1
            ? { done: false as const }
            : { done: true as const, result: "complete" };
        },
      }),
      commit,
      requestFrame: (callback) => {
        callback(0);
        return 1;
      },
      cancelFrame: vi.fn(),
      now: () => 0,
    });

    scheduler.schedule("paste", "immediate");

    await vi.waitFor(() => {
      expect(commit).toHaveBeenCalledWith(
        "complete",
        expect.objectContaining({ reason: "paste" }),
      );
    });
  });

  it("cancels queued and partial work when disposed", () => {
    const commit = vi.fn();
    const scheduler = createEditPaginationScheduler({
      getRevision: () => revision,
      createWork: () => ({ run: () => ({ done: false }) }),
      commit,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: () => 0,
    });

    scheduler.schedule("input", "normal");
    frames.flushFrame();
    scheduler.dispose();

    expect(frames.scheduledCount()).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });
});
