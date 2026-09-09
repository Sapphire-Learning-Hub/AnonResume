import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

import { AdminExportActions } from "@/components/admin/AdminExportActions";

describe("AdminExportActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms before cancelling an active export", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    render(
      <AdminExportActions
        canCancel
        canRetry={false}
        filename="resume.pdf"
        jobId="job-1"
        status="queued"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "取消 PDF 导出" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认取消" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/exports/job-1/cancel",
        { method: "POST" },
      );
    });
  });
});
