import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  publish: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/announcements/management", () => ({
  AnnouncementNotFoundError: class extends Error {},
  createAnnouncement: mocks.create,
  listManagedAnnouncements: mocks.list,
  publishAnnouncement: mocks.publish,
}));

import { GET, POST } from "@/app/api/manage/announcements/route";
import { POST as publish } from "@/app/api/manage/announcements/[id]/publish/route";

describe("management announcement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "admin-1" });
    mocks.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    mocks.create.mockResolvedValue({ id: "notice-1", status: "draft" });
    mocks.publish.mockResolvedValue({ id: "notice-1", status: "published" });
  });

  it("requires read permission for the paginated list", async () => {
    const response = await GET(
      new Request("http://localhost/api/manage/announcements?page=2&pageSize=10&q=维护"),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "announcements.read",
    });
    expect(mocks.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      query: "维护",
    });
  });

  it("validates and creates a draft with management permission", async () => {
    const response = await POST(
      new Request("http://localhost/api/manage/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titleZh: "系统维护",
          bodyZh: "服务将在今晚维护。",
          titleEn: "",
          bodyEn: "",
          tone: "warning",
          audience: "all",
          dismissible: true,
          expiresAt: null,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "announcements.manage",
    });
    expect(mocks.create).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      draft: expect.objectContaining({
        titleZh: "系统维护",
        titleEn: null,
      }),
    });
  });

  it("requires recent MFA before publishing", async () => {
    const response = await publish(
      new Request(
        "http://localhost/api/manage/announcements/notice-1/publish",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "notice-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "announcements.manage",
      recentMfa: true,
    });
    expect(mocks.publish).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      announcementId: "notice-1",
    });
  });
});
