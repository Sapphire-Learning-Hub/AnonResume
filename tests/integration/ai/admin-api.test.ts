import { requireAdminApi } from "@/lib/admin/api";
import {
  createAiAdminModel,
  deleteAiAdminProvider,
  deleteAiAdminModel,
  getAiAdminAuditEvidence,
  listAiAdminModelRateVersions,
  listAiAdminUsage,
  updateAiAdminModel,
  updateAiAdminQuota,
} from "@/lib/ai/admin/service";

import { GET as GET_AUDIT } from "@/app/api/manage/ai/audit/[runId]/route";
import {
  GET as GET_USAGE,
  POST as POST_USAGE,
} from "@/app/api/manage/ai/usage/route";
import { PATCH as PATCH_QUOTA } from "@/app/api/manage/ai/quotas/route";
import { DELETE as DELETE_PROVIDER } from "@/app/api/manage/ai/providers/[id]/route";
import { DELETE as DELETE_MODEL } from "@/app/api/manage/ai/providers/[id]/models/[modelId]/route";
import { PATCH as PATCH_MODEL } from "@/app/api/manage/ai/providers/[id]/models/[modelId]/route";
import { GET as GET_MODEL_RATE_VERSIONS } from "@/app/api/manage/ai/providers/[id]/models/[modelId]/rate-versions/route";
import { POST as POST_MODEL } from "@/app/api/manage/ai/providers/[id]/models/route";

vi.mock("@/lib/admin/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/api")>();
  return { ...actual, requireAdminApi: vi.fn() };
});

vi.mock("@/lib/ai/admin/service", () => ({
  createAiAdminModel: vi.fn(),
  deleteAiAdminProvider: vi.fn(),
  deleteAiAdminModel: vi.fn(),
  getAiAdminAuditEvidence: vi.fn(),
  listAiAdminModelRateVersions: vi.fn(),
  listAiAdminUsage: vi.fn(),
  resolveAiAdminSettlement: vi.fn(),
  updateAiAdminModel: vi.fn(),
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
        headers: { origin: "http://localhost" },
        body: JSON.stringify({
          userId: "user-1",
          monthlyLimit: 2000,
          periodStartedAt: "2026-09-01T00:00:00.000Z",
          periodEndsAt: "2026-10-01T00:00:00.000Z",
        }),
      }),
    );
    expect(quota.status).toBe(200);
    expect(requireAdminApi).toHaveBeenNthCalledWith(1, {
      permission: "ai.quotas.manage",
      recentMfa: true,
    });
    expect(updateAiAdminQuota).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      userId: "user-1",
      monthlyLimit: 2000,
      periodStartedAt: new Date("2026-09-01T00:00:00.000Z"),
      periodEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    const settlement = await POST_USAGE(
      new Request("http://localhost/api/manage/ai/usage", {
        method: "POST",
        headers: { origin: "http://localhost" },
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

  it("requires recent MFA and provider ownership when deleting a model", async () => {
    vi.mocked(deleteAiAdminModel).mockResolvedValue(undefined);

    const response = await DELETE_MODEL(
      new Request("http://localhost/api/manage/ai/providers/provider-1/models/model-1", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      {
        params: Promise.resolve({ id: "provider-1", modelId: "model-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(requireAdminApi).toHaveBeenCalledWith({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    expect(deleteAiAdminModel).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      providerId: "provider-1",
      modelId: "model-1",
    });
  });

  it("deletes a disabled provider instead of treating deletion as disable", async () => {
    vi.mocked(deleteAiAdminProvider).mockResolvedValue(undefined);

    const response = await DELETE_PROVIDER(
      new Request("http://localhost/api/manage/ai/providers/provider-1", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "provider-1" }) },
    );

    expect(response.status).toBe(200);
    expect(deleteAiAdminProvider).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      providerId: "provider-1",
    });
  });

  it("creates and updates models independently from provider settings", async () => {
    const value = {
      providerModelKey: "example-model",
      displayName: "Example model",
      enabled: true,
      supportsToolCalls: true,
      freeModel: false,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      inputPointRate: 10,
      cachedInputPointRate: 5,
      outputPointRate: 20,
    };
    vi.mocked(createAiAdminModel).mockResolvedValue({ modelId: "model-1" } as never);
    vi.mocked(updateAiAdminModel).mockResolvedValue({ modelId: "model-1" } as never);

    const created = await POST_MODEL(
      new Request("http://localhost/api/manage/ai/providers/provider-1/models", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(value),
      }),
      { params: Promise.resolve({ id: "provider-1" }) },
    );
    expect(created.status).toBe(201);
    expect(createAiAdminModel).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      providerId: "provider-1",
      value,
    });

    const updated = await PATCH_MODEL(
      new Request("http://localhost/api/manage/ai/providers/provider-1/models/model-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ ...value, displayName: "Updated model" }),
      }),
      { params: Promise.resolve({ id: "provider-1", modelId: "model-1" }) },
    );
    expect(updated.status).toBe(200);
    expect(updateAiAdminModel).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      providerId: "provider-1",
      modelId: "model-1",
      value: { ...value, displayName: "Updated model" },
    });
    expect(requireAdminApi).toHaveBeenLastCalledWith({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
  });

  it("reads model rate history without requiring recent MFA", async () => {
    vi.mocked(listAiAdminModelRateVersions).mockResolvedValue({
      modelId: "model-1",
      currentVersion: 2,
      versions: [],
    });

    const response = await GET_MODEL_RATE_VERSIONS(
      new Request(
        "http://localhost/api/manage/ai/providers/provider-1/models/model-1/rate-versions",
      ),
      {
        params: Promise.resolve({ id: "provider-1", modelId: "model-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(requireAdminApi).toHaveBeenCalledWith({
      permission: "ai.providers.manage",
    });
    expect(listAiAdminModelRateVersions).toHaveBeenCalledWith({
      providerId: "provider-1",
      modelId: "model-1",
    });
  });
});
