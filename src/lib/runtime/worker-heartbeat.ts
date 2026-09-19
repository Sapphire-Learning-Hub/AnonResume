import { sql } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  workerType: string;
  release?: string;
  startedAt: Date;
  metadata?: Record<string, unknown>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const release = input.release ?? getApplicationRelease();
  await db
    .insert(workerHeartbeats)
    .values({
      workerId: input.workerId,
      workerType: input.workerType,
      release,
      startedAt: input.startedAt,
      lastSeenAt: now,
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: {
        lastSeenAt: now,
        release,
        metadata: input.metadata ?? {},
        workerType: input.workerType,
        startedAt: sql`least(${workerHeartbeats.startedAt}, ${input.startedAt})`,
      },
    });
}
