import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { cleanupImages } from "@/lib/resume/assets/maintenance";
import {
  processTrashedResumeStops,
  runResumeTrashMaintenance,
} from "./maintenance";

type Runtime = {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};
declare global {
  var __anonResumeTrashRuntime: Runtime | undefined;
}
const state = () =>
  (globalThis.__anonResumeTrashRuntime ??= { running: false, timer: null });
const log = getLogger("anonresume.resume");

async function maintain() {
  const runtime = state();
  if (runtime.running) return;
  runtime.running = true;
  try {
    await processTrashedResumeStops();
    const result = await runResumeTrashMaintenance();
    const images = await cleanupImages();
    if (images.removed || images.failed) log[images.failed ? "warn" : "info"]("image_maintenance_completed", { labels: images, outcome: images.failed ? "failure" : "success" });
    if (result.purged || result.failed)
      log[result.failed ? "warn" : "info"]("trash_maintenance_completed", {
        labels: result,
        outcome: result.failed ? "failure" : "success",
      });
  } catch (error) {
    log.error("trash_maintenance_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
  } finally {
    runtime.running = false;
  }
}

export function startResumeTrashMaintenanceLoop(
  input: { intervalMs?: number } = {},
) {
  const runtime = state();
  if (runtime.timer) return;
  void maintain();
  runtime.timer = setInterval(
    () => void maintain(),
    input.intervalMs ?? 60_000,
  );
  runtime.timer.unref?.();
}

export function stopResumeTrashMaintenanceLoop() {
  const runtime = state();
  if (runtime.timer) clearInterval(runtime.timer);
  runtime.timer = null;
}
