import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalIdentitySession: vi.fn(),
  getAccountLifecycle: vi.fn(),
  isManagementOnlyIdentity: vi.fn(),
  streamAccountExport: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalIdentitySession: mocks.getOptionalIdentitySession,
}));
vi.mock("@/lib/auth/account/repository", () => ({
  getAccountLifecycle: mocks.getAccountLifecycle,
}));
vi.mock("@/lib/admin/store", () => ({
  isManagementOnlyIdentity: mocks.isManagementOnlyIdentity,
}));
vi.mock("@/lib/auth/account/export-workbook", () => ({
  streamAccountExport: mocks.streamAccountExport,
}));

import { GET } from "@/app/api/account/export/route";

describe("account export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalIdentitySession.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.getAccountLifecycle.mockResolvedValue({
      status: "pending_deletion",
    });
    mocks.isManagementOnlyIdentity.mockResolvedValue(false);
    mocks.streamAccountExport.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("xlsx"));
          controller.close();
        },
      }),
    );
  });

  it("allows a pending account to download a no-store workbook", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/account/export?locale=en-US"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
    expect(mocks.streamAccountExport).toHaveBeenCalledWith("user-1", "en-US");
  });

  it("rejects deleted and management-only identities", async () => {
    mocks.getAccountLifecycle.mockResolvedValue({ status: "deleted" });
    await expect(
      GET(new Request("https://app.example.com/api/account/export")),
    ).resolves.toMatchObject({ status: 403 });

    mocks.getAccountLifecycle.mockResolvedValue({ status: "active" });
    mocks.isManagementOnlyIdentity.mockResolvedValue(true);
    await expect(
      GET(new Request("https://app.example.com/api/account/export")),
    ).resolves.toMatchObject({ status: 403 });
  });
});
