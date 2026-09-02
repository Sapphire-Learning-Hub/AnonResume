import { fireEvent, render, screen } from "@testing-library/react";

import { ResumeDeleteForm } from "@/components/dashboard/ResumeDashboardShell";

describe("ResumeDeleteForm", () => {
  it("keeps confirmation in a controlled modal without rendering a menu trigger", () => {
    const onOpenChange = vi.fn();

    render(
      <ResumeDeleteForm
        open
        renderTrigger={false}
        resume={{
          id: "resume-one",
          title: "前端简历",
          summary: "React",
          updatedAt: Date.UTC(2026, 7, 31),
          version: 3,
          published: false,
        }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "删除“前端简历”？" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("delete-resume-trigger")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关 闭" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
