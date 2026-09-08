import { sql } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  workerType: string;
  startedAt: Date;
  metadata?: Record<string, unknown>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await db
    .insert(workerHeartbeats)
    .values({
      workerId: input.workerId,
      workerType: input.workerType,
      release: process.env.ANONRESUME_RELEASE || null,
      startedAt: input.startedAt,
      lastSeenAt: now,
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: {
        lastSeenAt: now,
        release: process.env.ANONRESUME_RELEASE || null,
        metadata: input.metadata ?? {},
        workerType: input.workerType,
        startedAt: sql`least(${workerHeartbeats.startedAt}, ${input.startedAt})`,
      },
    });
}
