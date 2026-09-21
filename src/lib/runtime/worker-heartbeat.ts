import { and, eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  sessionId?: string;
  workerType: string;
  release?: string;
  startedAt: Date;
  metadata?: Record<string, unknown>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const release = input.release ?? getApplicationRelease();
  const sessionId = input.sessionId ?? input.workerId;
  await db
    .insert(workerHeartbeats)
    .values({
      workerId: input.workerId,
      sessionId,
      workerType: input.workerType,
      release,
      startedAt: input.startedAt,
      lastSeenAt: now,
      metadata: input.metadata ?? {},
      status: "running",
      stoppedAt: null,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: {
        sessionId,
        lastSeenAt: now,
        release,
        metadata: input.metadata ?? {},
        workerType: input.workerType,
        startedAt: input.startedAt,
        status: "running",
        stoppedAt: null,
      },
    });
}

export async function markWorkerStopped(input: {
  workerId: string;
  sessionId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await db
    .update(workerHeartbeats)
    .set({
      lastSeenAt: now,
      status: "stopped",
      stoppedAt: now,
    })
    .where(
      and(
        eq(workerHeartbeats.workerId, input.workerId),
        eq(workerHeartbeats.sessionId, input.sessionId),
      ),
    );
}
