export interface EditPaginationRevision {
  document: number;
  geometry: number;
  width: number;
}

export type EditPaginationPriority = "normal" | "immediate";

export type EditPaginationReason =
  | "initial"
  | "document"
  | "input"
  | "paste"
  | "drop"
  | "history"
  | "format"
  | "structure"
  | "compositionEnd"
  | "geometry"
  | "width";

export interface EditPaginationRequest {
  reason: EditPaginationReason;
  priority: EditPaginationPriority;
  revision: EditPaginationRevision;
  sequence: number;
}

export type EditPaginationWorkStep<TResult> =
  | { done: false }
  | { done: true; aborted: true }
  | { done: true; result: TResult };

export interface EditPaginationWork<TResult> {
  run: (deadline: number) => EditPaginationWorkStep<TResult>;
}

interface EditPaginationSchedulerOptions<TResult> {
  getRevision: () => EditPaginationRevision;
  createWork: (
    request: EditPaginationRequest,
  ) => EditPaginationWork<TResult> | undefined;
  commit: (result: TResult, request: EditPaginationRequest) => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
  frameBudgetMs?: number;
}

export interface EditPaginationScheduler {
  schedule: (
    reason: EditPaginationReason,
    priority: EditPaginationPriority,
  ) => void;
  setComposing: (composing: boolean) => void;
  dispose: () => void;
}

function revisionsEqual(
  left: EditPaginationRevision,
  right: EditPaginationRevision,
) {
  return (
    left.document === right.document &&
    left.geometry === right.geometry &&
    left.width === right.width
  );
}

export function createEditPaginationScheduler<TResult>({
  getRevision,
  createWork,
  commit,
  requestFrame = window.requestAnimationFrame.bind(window),
  cancelFrame = window.cancelAnimationFrame.bind(window),
  now = () => performance.now(),
  frameBudgetMs = 8,
}: EditPaginationSchedulerOptions<TResult>): EditPaginationScheduler {
  let disposed = false;
  let composing = false;
  let sequence = 0;
  let frameId: number | undefined;
  let queuedRequest: EditPaginationRequest | undefined;
  let normalDelaySequence: number | undefined;
  let runningFrame = false;
  let continuationQueued = false;
  let active:
    | {
        request: EditPaginationRequest;
        work: EditPaginationWork<TResult>;
      }
    | undefined;

  const cancelScheduledFrame = () => {
    if (frameId === undefined) return;
    cancelFrame(frameId);
    frameId = undefined;
  };

  const isCurrent = (request: EditPaginationRequest) =>
    request.sequence === sequence &&
    revisionsEqual(request.revision, getRevision());

  const requestNextFrame = () => {
    if (runningFrame) {
      if (!continuationQueued) {
        continuationQueued = true;
        queueMicrotask(() => {
          continuationQueued = false;
          requestNextFrame();
        });
      }
      return;
    }

    if (
      disposed ||
      composing ||
      frameId !== undefined ||
      (!queuedRequest && !active)
    ) {
      return;
    }

    let ranSynchronously = false;
    const nextFrameId = requestFrame(() => {
      ranSynchronously = true;
      frameId = undefined;
      runFrame();
    });

    if (!ranSynchronously) {
      frameId = nextFrameId;
    }
  };

  const runFrame = () => {
    runningFrame = true;

    try {
      if (disposed || composing) return;

      if (queuedRequest) {
        if (
          queuedRequest.priority === "normal" &&
          normalDelaySequence === queuedRequest.sequence
        ) {
          normalDelaySequence = undefined;
          requestNextFrame();
          return;
        }

        const request = queuedRequest;
        queuedRequest = undefined;
        const work = isCurrent(request) ? createWork(request) : undefined;
        active = work ? { request, work } : undefined;
      }

      if (!active) return;

      if (!isCurrent(active.request)) {
        active = undefined;
        requestNextFrame();
        return;
      }

      const completed = active.work.run(now() + frameBudgetMs);

      if (!completed.done) {
        requestNextFrame();
        return;
      }

      const completedRequest = active.request;
      active = undefined;

      if ("result" in completed && isCurrent(completedRequest)) {
        commit(completed.result, completedRequest);
      }

      requestNextFrame();
    } finally {
      runningFrame = false;
    }
  };

  return {
    schedule(
      reason: EditPaginationReason,
      priority: EditPaginationPriority,
    ) {
      if (disposed) return;

      sequence += 1;
      queuedRequest = {
        reason,
        priority,
        revision: { ...getRevision() },
        sequence,
      };
      active = undefined;
      normalDelaySequence = priority === "normal" ? sequence : undefined;

      if (priority === "immediate") {
        cancelScheduledFrame();
      }

      requestNextFrame();
    },
    setComposing(nextComposing: boolean) {
      if (disposed || composing === nextComposing) return;

      composing = nextComposing;

      if (composing) {
        cancelScheduledFrame();
        active = undefined;
        return;
      }

      if (queuedRequest) {
        sequence += 1;
        queuedRequest = {
          ...queuedRequest,
          priority: "immediate",
          revision: { ...getRevision() },
          sequence,
        };
        normalDelaySequence = undefined;
      }

      requestNextFrame();
    },
    dispose() {
      disposed = true;
      cancelScheduledFrame();
      queuedRequest = undefined;
      normalDelaySequence = undefined;
      continuationQueued = false;
      active = undefined;
    },
  };
}
