import { render, screen } from "@testing-library/react";
import { ApplicationGanttMilestones } from "@/components/dashboard/job-search/ApplicationGanttMilestones";
import type { StageMilestone } from "@/domain/job-search/schema";
it("renders every stage as an individually accessible dated point on the same time bar", () => {
  const dates = [
    "2026-10-30T00:41:57Z",
    "2026-10-30T00:44:00Z",
    "2026-10-30T01:16:18Z",
    "2026-10-30T01:19:36Z",
  ];
  const stages: StageMilestone["stage"][] = [
    "pending",
    "applied",
    "interview_2",
    "rejected",
  ];
  const items = dates.map((time, index) => ({
    id: crypto.randomUUID(),
    stage: stages[index]!,
    fromStage: index ? stages[index - 1]! : null,
    occurredAt: time,
    recordedAt: time,
  }));
  render(
    <ApplicationGanttMilestones
      page={{ items, total: 4, nextCursor: null }}
      scale={{
        start: Date.parse("2026-10-30T00:35:00Z"),
        end: Date.parse("2026-10-30T01:25:00Z"),
      }}
      range={{ start: Date.parse(dates[0]!), end: Date.parse(dates[3]!) }}
      width={1400}
      status="rejected"
      busy={false}
      onMore={() => undefined}
      onOpen={() => undefined}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(4);
  for (const time of dates)
    expect(
      screen.getByRole("button", {
        name: new RegExp(
          new Date(time)
            .toLocaleString("zh-CN")
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      }),
    ).toBeVisible();
});
