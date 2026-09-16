import { fireEvent, render, screen, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

import {
  AdminAnnouncementManager,
  type AnnouncementListItem,
} from "@/components/admin/AdminAnnouncementManager";

const publishedAnnouncement: AnnouncementListItem = {
  id: "announcement-1",
  titleZh: "版本提示",
  bodyZh: "当前版本仍在持续完善。",
  titleEn: "Version notice",
  bodyEn: "This release is still being improved.",
  tone: "warning",
  audience: "all",
  dismissible: true,
  status: "published",
  publishedAt: "2026-09-16T08:00:00.000Z",
  expiresAt: "2026-10-01T08:00:00.000Z",
  createdAt: "2026-09-16T07:00:00.000Z",
  updatedAt: "2026-09-16T08:00:00.000Z",
};

function renderManager({
  announcements = [publishedAnnouncement],
  canManage = true,
}: {
  announcements?: AnnouncementListItem[];
  canManage?: boolean;
} = {}) {
  return render(
    <AdminAnnouncementManager
      announcements={announcements}
      canManage={canManage}
      page={1}
      pageSize={20}
      query=""
      searchParams={{}}
      title="公告管理"
      total={announcements.length}
      totalPages={announcements.length ? 1 : 0}
    />,
  );
}

describe("AdminAnnouncementManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the default editor focused on Chinese and opens translations separately", () => {
    renderManager({ announcements: [] });

    fireEvent.click(screen.getByRole("button", { name: "新建公告" }));
    const editor = screen.getByRole("dialog", { name: "新建公告" });

    expect(within(editor).getByLabelText("中文标题")).toBeInTheDocument();
    expect(within(editor).getByLabelText("中文正文")).toBeInTheDocument();
    expect(within(editor).queryByLabelText("英文标题（可选）")).toBeNull();

    fireEvent.click(
      within(editor).getByRole("button", { name: "多语言设置" }),
    );

    const translations = screen
      .getByText("多语言设置", { selector: ".ant-modal-title" })
      .closest('[role="dialog"]');
    expect(translations).not.toBeNull();
    expect(
      within(translations as HTMLElement).getByLabelText("英文标题（可选）"),
    ).toBeInTheDocument();
    expect(
      within(translations as HTMLElement).getByLabelText("英文正文（可选）"),
    ).toBeInTheDocument();
  });

  it("allows read-only administrators to inspect a published announcement", () => {
    renderManager({ canManage: false });

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    const details = screen.getByRole("dialog", { name: "公告详情" });

    expect(within(details).getByText("当前版本仍在持续完善。")).toBeInTheDocument();
    expect(
      within(details).getByText("This release is still being improved."),
    ).toBeInTheDocument();
    expect(within(details).getByText("已发布")).toBeInTheDocument();
  });
});
