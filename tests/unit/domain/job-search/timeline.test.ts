import {
  applicationTimeline,
  timelineScale,
} from "@/domain/job-search/timeline";
it("uses actual application dates and fixes completed ranges to the stage event rather than later notes", () => {
  const base = {
    createdAt: "2026-10-10T10:00:00Z",
    appliedAt: "2026-10-08T10:00:00Z",
    closedAt: null,
    stage: "applied" as const,
  };
  const now = new Date("2026-10-30T12:00:00Z");
  expect(applicationTimeline(base, now)).toEqual({
    start: Date.parse(base.appliedAt),
    end: now.getTime(),
    ongoing: true,
  });
  expect(
    applicationTimeline({ ...base, stage: "pending", appliedAt: null }, now)
      .start,
  ).toBe(Date.parse(base.createdAt));
  const terminal = applicationTimeline(
    { ...base, stage: "rejected", closedAt: "2026-10-20T08:00:00Z" },
    now,
  );
  expect(terminal).toEqual({
    start: Date.parse(base.appliedAt),
    end: Date.parse("2026-10-20T08:00:00Z"),
    ongoing: false,
  });
  const sameDay = applicationTimeline(
    { ...base, stage: "withdrawn", appliedAt: null, closedAt: base.createdAt },
    now,
  );
  const scale = timelineScale([sameDay], now);
  expect(scale.end).toBeGreaterThan(scale.start);
  expect(scale.ticks).toHaveLength(6);
  expect(scale.start).toBeLessThanOrEqual(sameDay.start);
  expect(scale.end).toBeGreaterThanOrEqual(sameDay.end);
});
