import { startQueueMetricsSampler } from "@/lib/observability/metrics/queue-sampler";
import { initializeMetricCapture } from "../../../support/observability";

it("exports cached queue state and skips overlapping refreshes", async () => {
  const capture = await initializeMetricCapture("web");
  let releaseSnapshot!: () => void;
  const snapshotMayFinish = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  let reads = 0;
  let scheduledRefresh: (() => void) | undefined;
  const sampler = startQueueMetricsSampler({
    now: () => new Date("2026-10-19T00:00:10.000Z"),
    scheduler: {
      schedule(callback) {
        scheduledRefresh = callback;
        return { cancel: () => undefined };
      },
    },
    sources: [{
      jobType: "ai",
      async readSnapshot() {
        reads += 1;
        await snapshotMayFinish;
        return {
          counts: { queued: 2, streaming: 1 },
          oldestQueuedAt: new Date("2026-10-19T00:00:04.000Z"),
        };
      },
    }],
  });

  expect(reads).toBe(1);
  scheduledRefresh?.();
  const overlapping = sampler.refresh();
  expect(reads).toBe(1);
  releaseSnapshot();
  await overlapping;

  const metrics = await capture.metrics();
  const jobs = metrics.find(
    (metric) => metric.descriptor.name === "anonresume.queue.jobs",
  );
  expect(jobs?.dataPoints).toEqual(expect.arrayContaining([
    expect.objectContaining({
      attributes: { "job.type": "ai", "queue.state": "queued" },
      value: 2,
    }),
    expect.objectContaining({
      attributes: { "job.type": "ai", "queue.state": "streaming" },
      value: 1,
    }),
  ]));
  const age = metrics.find(
    (metric) =>
      metric.descriptor.name === "anonresume.queue.oldest_queued.age",
  );
  expect(age?.dataPoints).toEqual([
    expect.objectContaining({
      attributes: { "job.type": "ai" },
      value: 6,
    }),
  ]);

  await sampler.stop();
  await capture.shutdown();
});
