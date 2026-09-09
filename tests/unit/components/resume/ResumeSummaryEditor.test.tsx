import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: feedbackMocks.toastError },
  }),
}));

import { ResumeSummaryEditor } from "@/components/resume/ResumeSummaryEditor";

describe("ResumeSummaryEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("reports save failures through the shared toast channel", async () => {
    const saveSummary = vi.fn().mockRejectedValue(new Error("failed"));

    render(
      <ResumeSummaryEditor
        initialSummary="React"
        open
        renderTrigger={false}
        resumeId="resume-one"
        saveSummary={saveSummary}
        version={3}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存简介" }));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith(
        "简介保存失败，请刷新后重试。",
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
