import { runAccountMaintenance } from "./maintenance";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

type AccountMaintenanceRuntime = {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

declare global {
  var __anonResumeAccountMaintenanceRuntime:
    | AccountMaintenanceRuntime
    | undefined;
}

function runtimeState() {
  globalThis.__anonResumeAccountMaintenanceRuntime ??= {
    running: false,
    timer: null,
  };
  return globalThis.__anonResumeAccountMaintenanceRuntime;
}

async function executeMaintenance() {
  const state = runtimeState();
  if (state.running) return;
  state.running = true;
  try {
    await runAccountMaintenance({
      notifyDeleted: ({ email, name }) =>
        sendAccountSecurityNotice({
          email,
          name,
          event: "account_deleted",
          locale: "zh-CN",
        }),
    });
  } catch (error) {
    console.error("[AnonResume] Account maintenance failed", error);
  } finally {
    state.running = false;
  }
}

export function startAccountMaintenanceLoop(input: {
  intervalMs?: number;
} = {}) {
  const state = runtimeState();
  if (state.timer) return;

  void executeMaintenance();
  state.timer = setInterval(
    () => void executeMaintenance(),
    input.intervalMs ?? DEFAULT_INTERVAL_MS,
  );
  state.timer.unref?.();
}

export function stopAccountMaintenanceLoop() {
  const state = runtimeState();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
