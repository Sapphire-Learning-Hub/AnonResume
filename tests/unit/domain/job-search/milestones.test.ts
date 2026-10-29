import {
  fitTimelineLabel,
  milestoneViewport,
  timelineScale,
} from "@/domain/job-search/timeline";
it("zooms to individual minute-level stage changes rather than merging them into a day-level point", () => {
  const points = [
    { time: Date.parse("2026-10-30T00:41:57Z"), labelWidth: 52 },
    { time: Date.parse("2026-10-30T00:44:00Z"), labelWidth: 64 },
    { time: Date.parse("2026-10-30T01:16:18Z"), labelWidth: 40 },
    { time: Date.parse("2026-10-30T01:19:36Z"), labelWidth: 108 },
  ];
  const width = 1400;
  const scale = milestoneViewport([points], width, {
    start: Date.parse("2026-10-10T00:00:00Z"),
    end: Date.parse("2026-10-31T00:00:00Z"),
  });
  expect(scale.start).toBeLessThan(points[0]!.time);
  expect(scale.end).toBeGreaterThan(points.at(-1)!.time);
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    const distance =
      ((b.time - a.time) / (scale.end - scale.start)) * scale.width;
    expect(distance).toBeGreaterThan((a.labelWidth + b.labelWidth) / 2);
  }
});
it("uses the full timeline when stage names already have room", () => {
  const scale = milestoneViewport(
    [
      [
        { time: 100, labelWidth: 20 },
        { time: 900, labelWidth: 20 },
      ],
    ],
    1000,
    { start: 0, end: 1000 },
  );
  expect(scale).toMatchObject({ start: 0, end: 1000 });
});
it("includes historical stage dates beyond the current application range without changing that range", () => {
  const range = {
    start: Date.parse("2026-10-10T00:00:00Z"),
    end: Date.parse("2026-10-20T00:00:00Z"),
    ongoing: false,
  };
  const stage = Date.parse("2026-10-27T00:00:00Z");
  const scale = timelineScale([range], new Date("2026-10-30T00:00:00Z"), [
    stage,
  ]);
  expect(scale.end).toBeGreaterThanOrEqual(stage);
  expect(range.end).toBe(Date.parse("2026-10-20T00:00:00Z"));
});

it("keeps endpoint captions inside the bar without changing their time anchors", () => {
  for (const position of [200, 205, 500, 795, 800]) {
    const label = fitTimelineLabel(position, 100, { start: 200, end: 800 });
    expect(position + label.offset).toBeGreaterThanOrEqual(200);
    expect(position + label.offset + label.width).toBeLessThanOrEqual(800);
    if (position === 500) expect(label.offset).toBe(-50);
  }
});
it("bounds a long caption to a short bar instead of extending the timeline", () => {
  const label = fitTimelineLabel(210, 108, { start: 200, end: 210 });
  expect(label.width).toBe(10);
  expect(210 + label.offset).toBe(200);
});
