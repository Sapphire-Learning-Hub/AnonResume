import { eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import {
  AI_WORKER_STALE_MS,
  getAiWorkerAvailability,
} from "@/lib/ai/worker-availability";
import {
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "@/lib/runtime/worker-heartbeat";

describe("AI worker availability", () => {
  const workerId = "ai-availability-test-worker";
  const heartbeatAt = new Date("2100-01-01T00:00:00.000Z");

  afterEach(async () => {
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId));
  });

  it("keeps a healthy worker available across a configured long poll", async () => {
    await recordWorkerHeartbeat({
      workerId,
      workerType: "ai-runtime",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });

    await expect(
      getAiWorkerAvailability({
        now: new Date(heartbeatAt.getTime() + 30_000),
        pollIntervalMs: 20_000,
      }),
    ).resolves.toEqual({ available: true });
  });

  it("requires a recent AI runtime heartbeat", async () => {
    await recordWorkerHeartbeat({
      workerId,
      workerType: "ai-runtime",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });

    await expect(getAiWorkerAvailability({ now: heartbeatAt })).resolves.toEqual({
      available: true,
    });
    await expect(
      getAiWorkerAvailability({
        now: new Date(heartbeatAt.getTime() + AI_WORKER_STALE_MS + 1),
      }),
    ).resolves.toEqual({ available: false });
  });

  it("replaces the process session without creating another worker", async () => {
    const restartedAt = new Date(heartbeatAt.getTime() + 60_000);
    await recordWorkerHeartbeat({
      workerId,
      sessionId: "session-1",
      workerType: "ai-runtime",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });
    await markWorkerStopped({
      workerId,
      sessionId: "session-1",
      now: new Date(heartbeatAt.getTime() + 1_000),
    });
    await recordWorkerHeartbeat({
      workerId,
      sessionId: "session-2",
      workerType: "ai-runtime",
      startedAt: restartedAt,
      now: restartedAt,
    });

    const rows = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: "session-2",
      startedAt: restartedAt,
      status: "running",
      stoppedAt: null,
    });
  });

  it("does not report a cleanly stopped worker as available", async () => {
    await recordWorkerHeartbeat({
      workerId,
      sessionId: "session-stopped",
      workerType: "ai-runtime",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });
    await markWorkerStopped({
      workerId,
      sessionId: "session-stopped",
      now: heartbeatAt,
    });

    await expect(getAiWorkerAvailability({ now: heartbeatAt })).resolves.toEqual({
      available: false,
    });
  });
});
