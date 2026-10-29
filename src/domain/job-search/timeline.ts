import type { ApplicationStage } from "./schema";
export type ApplicationTimeline = {
  start: number;
  end: number;
  ongoing: boolean;
};
export function applicationTimeline(
  application: {
    createdAt: string;
    appliedAt: string | null;
    closedAt: string | null;
    stage: ApplicationStage;
  },
  now: Date,
): ApplicationTimeline {
  const start = Date.parse(application.appliedAt ?? application.createdAt);
  const ongoing = !["offered", "rejected", "withdrawn"].includes(
    application.stage,
  );
  const end =
    !ongoing && application.closedAt
      ? Date.parse(application.closedAt)
      : now.getTime();
  return { start, end: Math.max(start, end), ongoing };
}
export function timelineScale(
  ranges: ApplicationTimeline[],
  now: Date,
  milestones: number[] = [],
) {
  const day = 86_400_000;
  const first = ranges.length
    ? Math.min(...ranges.map((range) => range.start), ...milestones)
    : now.getTime();
  const last = ranges.length
    ? Math.max(...ranges.map((range) => range.end), ...milestones)
    : now.getTime();
  const padding = Math.max(day, (last - first) * 0.03);
  const start = first - padding;
  const end = Math.max(last + padding, start + 7 * day);
  return {
    start,
    end,
    ticks: Array.from(
      { length: 6 },
      (_, index) => start + ((end - start) * index) / 5,
    ),
  };
}

/** Keep individual events readable by changing the visible time window, never by merging or moving them. */
export function milestoneViewport(
  rows: {
    time: number;
    labelWidth: number;
    before?: number;
    after?: number;
  }[][],
  width: number,
  full: { start: number; end: number },
) {
  let pixelsPerMs = 0;
  const times: number[] = [];
  for (const row of rows) {
    const points = [...row].sort((a, b) => a.time - b.time);
    times.push(...points.map((point) => point.time));
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!,
        current = points[index]!;
      const gap = current.time - previous.time;
      if (gap > 0)
        pixelsPerMs = Math.max(
          pixelsPerMs,
          ((previous.after ?? previous.labelWidth / 2) +
            (current.before ?? current.labelWidth / 2) +
            8) /
            gap,
        );
    }
  }
  const fullSpan = Math.max(1, full.end - full.start);
  if (!pixelsPerMs || fullSpan <= (width / pixelsPerMs) * 0.94)
    return { ...timelineWindow(full.start, full.end), width };
  const readableSpan = Math.max(1, (width / pixelsPerMs) * 0.94);
  const latest = Math.max(...times);
  // Keep nearby transitions in one window. A bounded wider canvas provides
  // room without falsifying timestamps or collecting labels at one point.
  const nearby = times.filter((time) => time >= latest - readableSpan * 2);
  const earliest = Math.min(...nearby);
  const span = Math.max(readableSpan, (latest - earliest) / 0.9);
  return {
    ...timelineWindow(
      (latest + earliest - span) / 2,
      (latest + earliest + span) / 2,
    ),
    width: Math.max(width, (span * pixelsPerMs) / 0.94),
  };
}
export function timelineWindow(start: number, end: number) {
  return {
    start,
    end,
    ticks: Array.from(
      { length: 6 },
      (_, index) => start + ((end - start) * index) / 5,
    ),
  };
}

/** Fit only the caption; the event's time coordinate is unchanged. */
export function fitTimelineLabel(
  position: number,
  requestedWidth: number,
  bounds: { start: number; end: number },
) {
  const width = Math.min(
    requestedWidth,
    Math.max(0, bounds.end - bounds.start),
  );
  const left = Math.max(
    bounds.start,
    Math.min(position - width / 2, bounds.end - width),
  );
  return { offset: left - position, width };
}
