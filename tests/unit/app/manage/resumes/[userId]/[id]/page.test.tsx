import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getResumeRecord: vi.fn(),
  requireAdminPage: vi.fn(),
  writeAdminAuditEvent: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/lib/admin/audit", () => ({
  writeAdminAuditEvent: mocks.writeAdminAuditEvent,
}));

vi.mock("@/lib/resume/repository", () => ({
  getResumeRecord: mocks.getResumeRecord,
}));

vi.mock("@/components/resume/ResumeRenderer", () => ({
  ResumeRenderer: () => <article>简历正文</article>,
}));

vi.mock("@/components/resume/ResponsiveResumeViewport", () => ({
  ResponsiveResumeViewport: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementResumeContentPage from "@/app/app/(workbench)/manage/resumes/[userId]/[id]/page";

describe("ManagementResumeContentPage", () => {
  it("provides a stable return link to the management resume list", async () => {
    mocks.requireAdminPage.mockResolvedValue({ userId: "admin-1" });
    mocks.getResumeRecord.mockResolvedValue({
      document: {},
      title: "测试简历",
    });
    mocks.writeAdminAuditEvent.mockResolvedValue(undefined);

    render(
      await ManagementResumeContentPage({
        params: Promise.resolve({ id: "resume-1", userId: "user-1" }),
      }),
    );

    expect(
      screen.getByRole("link", { name: "返回简历列表" }),
    ).toHaveAttribute("href", "/app/manage/resumes");
  });
});
