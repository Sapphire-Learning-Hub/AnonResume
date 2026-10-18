import {
  deliverAccountMergeNotices,
  runAccountMergeExecutor,
} from "./executor";
import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";

const DEFAULT_INTERVAL_MS = 2_000;
const accountLog = getLogger("anonresume.account");

type MergeRuntime = {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

declare global {
  var __anonResumeAccountMergeRuntime: MergeRuntime | undefined;
}

function runtimeState() {
  globalThis.__anonResumeAccountMergeRuntime ??= {
    running: false,
    timer: null,
  };
  return globalThis.__anonResumeAccountMergeRuntime;
}

export async function executeAccountMergeMaintenance() {
  const state = runtimeState();
  if (state.running) return;
  state.running = true;
  try {
    const result = await runAccountMergeExecutor();
    const notices = await deliverAccountMergeNotices();
    accountLog.info("merge_maintenance_completed", {
      labels: {
        completed: result.completed,
        deliveredNotices: notices.delivered,
        failed: result.failed + notices.failed,
        processed: result.processed,
        processedNotices: notices.processed,
        waiting: result.waiting,
      },
      outcome: "success",
    });
  } catch (error) {
    accountLog.error("merge_maintenance_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
  } finally {
    state.running = false;
  }
}

export function startAccountMergeRuntime(input: { intervalMs?: number } = {}) {
  const state = runtimeState();
  if (state.timer) return;
  void executeAccountMergeMaintenance();
  state.timer = setInterval(
    () => void executeAccountMergeMaintenance(),
    input.intervalMs ?? DEFAULT_INTERVAL_MS,
  );
  state.timer.unref?.();
}

export function stopAccountMergeRuntime() {
  const state = runtimeState();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
