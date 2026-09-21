import { and, eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";

const DEFAULT_STALE_AFTER_MS = 60_000;

function getHeartbeatStaleAfterMs(
  heartbeat: { metadata: Record<string, unknown> },
  workerType: "ai-runtime" | "pdf-export",
) {
  if (workerType !== "ai-runtime") return DEFAULT_STALE_AFTER_MS;

  const pollIntervalMs = heartbeat.metadata.pollIntervalMs;
  if (typeof pollIntervalMs !== "number" || !Number.isFinite(pollIntervalMs)) {
    return DEFAULT_STALE_AFTER_MS;
  }

  return Math.max(DEFAULT_STALE_AFTER_MS, pollIntervalMs * 2 + 5_000);
}

export async function checkWorkerHealth(input: {
  workerId: string;
  workerType: "ai-runtime" | "pdf-export";
  now?: Date;
  staleAfterMs?: number;
}): Promise<{ healthy: true } | { healthy: false; reason: string }> {
  const heartbeat = await db.query.workerHeartbeats.findFirst({
    where: and(
      eq(workerHeartbeats.workerId, input.workerId),
      eq(workerHeartbeats.workerType, input.workerType),
    ),
  });
  if (!heartbeat) return { healthy: false, reason: "heartbeat_missing" };
  if (heartbeat.status !== "running") {
    return { healthy: false, reason: "not_running" };
  }

  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ??
    getHeartbeatStaleAfterMs(heartbeat, input.workerType);
  if (now.getTime() - heartbeat.lastSeenAt.getTime() > staleAfterMs) {
    return { healthy: false, reason: "heartbeat_stale" };
  }
  return { healthy: true };
}
