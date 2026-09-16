import { requireAdminApi } from "@/lib/admin/api";
import {
  getAiAdminAuditEvidence,
  listAiAdminUsage,
  updateAiAdminQuota,
} from "@/lib/ai/admin/service";

import { GET as GET_AUDIT } from "@/app/api/manage/ai/audit/[runId]/route";
import {
  GET as GET_USAGE,
  POST as POST_USAGE,
} from "@/app/api/manage/ai/usage/route";
import { PATCH as PATCH_QUOTA } from "@/app/api/manage/ai/quotas/route";

vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/api")>();
  return { ...actual, requireAdminApi: vi.fn() };
});

vi.mock("@/lib/ai/admin/service", () => ({
  getAiAdminAuditEvidence: vi.fn(),
  listAiAdminUsage: vi.fn(),
  resolveAiAdminSettlement: vi.fn(),
  updateAiAdminQuota: vi.fn(),
}));

describe("AI administration routes", () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    vi.mocked(requireAdminApi).mockResolvedValue({ userId: "admin-1" } as never);
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it("keeps usage reads separate from sensitive evidence access", async () => {
    vi.mocked(listAiAdminUsage).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    vi.mocked(getAiAdminAuditEvidence).mockResolvedValue({
      runId: "run-1",
      request: { messages: [] },
      response: { text: "ok" },
      payloadHash: "hash",
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    const usage = await GET_USAGE(
      new Request("http://localhost/api/manage/ai/usage?page=1"),
    );
    expect(usage.status).toBe(200);
    expect(requireAdminApi).toHaveBeenNthCalledWith(1, {
      permission: "ai.usage.read",
    });

    const evidence = await GET_AUDIT(
      new Request("http://localhost/api/manage/ai/audit/run-1"),
      { params: Promise.resolve({ runId: "run-1" }) },
    );
    expect(evidence.status).toBe(200);
    expect(requireAdminApi).toHaveBeenNthCalledWith(2, {
      permission: "ai.audit.sensitive.read",
      recentMfa: true,
    });
  });

  it("requires recent MFA for quota changes and settlement decisions", async () => {
    vi.mocked(updateAiAdminQuota).mockResolvedValue({
      userId: "user-1",
      monthlyLimit: 2000,
    } as never);

    const quota = await PATCH_QUOTA(
      new Request("http://localhost/api/manage/ai/quotas", {
        method: "PATCH",
        body: JSON.stringify({ userId: "user-1", monthlyLimit: 2000 }),
      }),
    );
    expect(quota.status).toBe(200);
    expect(requireAdminApi).toHaveBeenNthCalledWith(1, {
      permission: "ai.quotas.manage",
      recentMfa: true,
    });

    const settlement = await POST_USAGE(
      new Request("http://localhost/api/manage/ai/usage", {
        method: "POST",
        body: JSON.stringify({
          runId: "00000000-0000-4000-8000-000000000001",
          decision: "release",
        }),
      }),
    );
    expect(settlement.status).toBe(200);
    expect(requireAdminApi).toHaveBeenNthCalledWith(2, {
      permission: "ai.quotas.manage",
      recentMfa: true,
    });
  });
});
