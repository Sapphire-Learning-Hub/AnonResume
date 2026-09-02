import { fireEvent, render, screen } from "@testing-library/react";

import { ResumeSummaryEditor } from "@/components/resume/ResumeSummaryEditor";

describe("ResumeSummaryEditor", () => {
  it("keeps the modal in a stable controlled host without rendering a trigger", () => {
    const onOpenChange = vi.fn();

    render(
      <ResumeSummaryEditor
        initialSummary="React"
        open
        renderTrigger={false}
        resumeId="resume-one"
        version={3}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "编辑简历简介" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "编辑简介" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关 闭" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
