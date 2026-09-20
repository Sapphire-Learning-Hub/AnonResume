import { eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import { checkWorkerHealth } from "@/lib/runtime/worker-health";
import {
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "@/lib/runtime/worker-heartbeat";

describe("worker health check", () => {
  const workerId = "default/ai-worker/health-test";
  const now = new Date("2100-01-01T00:00:00.000Z");

  afterEach(async () => {
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId));
  });

  it("requires a running recent heartbeat for the exact stable instance", async () => {
    await recordWorkerHeartbeat({
      workerId,
      sessionId: "session-1",
      workerType: "ai-runtime",
      startedAt: now,
      now,
    });

    await expect(
      checkWorkerHealth({ workerId, workerType: "ai-runtime", now }),
    ).resolves.toEqual({ healthy: true });

    await markWorkerStopped({ workerId, sessionId: "session-1", now });
    await expect(
      checkWorkerHealth({ workerId, workerType: "ai-runtime", now }),
    ).resolves.toEqual({ healthy: false, reason: "not_running" });
  });
});
