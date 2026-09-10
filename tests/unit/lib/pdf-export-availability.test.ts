import { eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import {
  getPdfExportWorkerAvailability,
  PDF_EXPORT_WORKER_STALE_MS,
} from "@/lib/pdf-export-availability";
import { recordWorkerHeartbeat } from "@/lib/worker-heartbeat";

describe("PDF export worker availability", () => {
  const workerId = "pdf-availability-test-worker";
  const heartbeatAt = new Date("2100-01-01T00:00:00.000Z");

  afterEach(async () => {
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, workerId));
  });

  it("treats only recent PDF worker heartbeats as available", async () => {
    await recordWorkerHeartbeat({
      workerId,
      workerType: "pdf-export",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });

    await expect(
      getPdfExportWorkerAvailability({ now: heartbeatAt }),
    ).resolves.toEqual({ available: true });
    await expect(
      getPdfExportWorkerAvailability({
        now: new Date(heartbeatAt.getTime() + PDF_EXPORT_WORKER_STALE_MS + 1),
      }),
    ).resolves.toEqual({ available: false });
  });

  it("records the worker build tag and commit in its heartbeat", async () => {
    await recordWorkerHeartbeat({
      workerId,
      workerType: "pdf-export",
      release: "v1.2.3 · abcdef123456",
      startedAt: heartbeatAt,
      now: heartbeatAt,
    });

    const heartbeat = await db.query.workerHeartbeats.findFirst({
      where: eq(workerHeartbeats.workerId, workerId),
    });
    expect(heartbeat?.release).toBe("v1.2.3 · abcdef123456");
  });
});
