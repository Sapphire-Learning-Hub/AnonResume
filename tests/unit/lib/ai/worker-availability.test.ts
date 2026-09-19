import { eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import {
  AI_WORKER_STALE_MS,
  getAiWorkerAvailability,
} from "@/lib/ai/worker-availability";
import { recordWorkerHeartbeat } from "@/lib/runtime/worker-heartbeat";

describe("AI worker availability", () => {
  const workerId = "ai-availability-test-worker";
  const heartbeatAt = new Date("2100-01-01T00:00:00.000Z");

  afterEach(async () => {
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId));
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
});
