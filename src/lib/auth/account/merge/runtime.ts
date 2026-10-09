import {
  deliverAccountMergeNotices,
  runAccountMergeExecutor,
} from "./executor";

const DEFAULT_INTERVAL_MS = 2_000;

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
    await runAccountMergeExecutor();
    await deliverAccountMergeNotices();
  } catch (error) {
    console.error("[AnonResume] Account merge maintenance failed", error);
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
