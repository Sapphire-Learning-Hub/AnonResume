import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listRequests: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/mfa-reset-requests", () => ({
  listAdminMfaResetRequests: mocks.listRequests,
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementMfaResetsPage from "@/app/app/(workbench)/manage/mfa-resets/page";

describe("ManagementMfaResetsPage", () => {
  it("keeps the request reason out of the table columns", async () => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });
    mocks.listRequests.mockResolvedValue({
      items: [
        {
          createdAt: new Date("2026-09-09T09:27:20.000Z"),
          expiresAt: new Date("2026-09-12T09:27:20.000Z"),
          id: "request-1",
          reason: "手机遗失，恢复码也无法找回。",
          requesterEmail: "user@example.com",
          requesterName: "User",
          reviewReason: null,
          status: "pending",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    render(
      await ManagementMfaResetsPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.queryByRole("columnheader", { name: "申请理由" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("手机遗失，恢复码也无法找回。")).toBeNull();
    expect(screen.getByRole("button", { name: "详情" })).toHaveClass(
      "ant-btn-link",
    );
  });
});
