import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listAdminExports: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/lib/admin/query", () => ({
  listAdminExports: mocks.listAdminExports,
}));

vi.mock("@/components/admin/AdminExportActions", () => ({
  AdminExportActions: () => null,
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementExportsPage from "@/app/app/(workbench)/manage/exports/page";

describe("ManagementExportsPage", () => {
  it("renders semantic labels for every export job status", async () => {
    mocks.requireAdminPage.mockResolvedValue({
      kind: "super_admin",
      permissions: [],
    });
    mocks.listAdminExports.mockResolvedValue({
      items: ["queued", "running", "completed", "failed", "cancelled"].map(
        (status, index) => ({
          attempts: index,
          completedAt: null,
          createdAt: new Date("2026-09-09T10:07:42.000Z"),
          filename: `resume-${index}.pdf`,
          id: `job-${index}`,
          requesterEmail: "user@example.com",
          status,
        }),
      ),
      page: 1,
      pageSize: 20,
      total: 5,
      totalPages: 1,
    });

    render(
      await ManagementExportsPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("排队中")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText("导出中")).toHaveAttribute("data-tone", "info");
    expect(screen.getByText("已完成")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("失败")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("已取消")).toHaveAttribute("data-tone", "default");
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
  });
});
