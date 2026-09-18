import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { aiProviderCredentials, db } from "@/db";
import { getOptionalSession } from "@/lib/auth/session";
import { listAvailableAiModels } from "@/lib/ai/conversations/repository";
import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";

import { GET as GET_SETTINGS } from "@/app/api/ai/settings/route";
import { POST as CREATE_PROVIDER } from "@/app/api/ai/settings/providers/route";
import {
  DELETE as DELETE_PROVIDER,
  PATCH as UPDATE_PROVIDER,
} from "@/app/api/ai/settings/providers/[providerId]/route";
import { POST as CREATE_MODEL } from "@/app/api/ai/settings/providers/[providerId]/models/route";
import {
  DELETE as DELETE_MODEL,
  PATCH as UPDATE_MODEL,
} from "@/app/api/ai/settings/providers/[providerId]/models/[modelId]/route";

vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/ai/security/endpoint-policy", () => ({
  assertSafeAiEndpoint: vi.fn(async (value: string | URL) => new URL(value)),
}));

function actionRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      origin: "http://localhost",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("personal AI provider and model routes", () => {
  const userId = `ai-settings-${randomUUID()}`;
  const otherUserId = `ai-settings-other-${randomUUID()}`;
  const encryptionKey = Buffer.alloc(32, 9);
  const originalEnvironment = { ...process.env };

  beforeAll(() => {
    process.env.AI_ENABLED = "true";
    process.env.AI_BYOK_ENABLED = "true";
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = encryptionKey.toString("base64");
  });

  beforeEach(() => {
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: `session-${userId}`, userId },
      user: { id: userId, name: userId, email: `${userId}@example.com` },
    } as never);
  });

  afterAll(async () => {
    process.env = originalEnvironment;
    await db
      .delete(aiProviderCredentials)
      .where(eq(aiProviderCredentials.ownerUserId, userId));
  });

  it("manages multiple providers with multiple models per provider", async () => {
    const firstProviderResponse = await CREATE_PROVIDER(actionRequest(
      "http://localhost/api/ai/settings/providers",
      "POST",
      {
        providerName: "Provider One",
        baseUrl: "https://one.example.com/v1",
        apiKey: "sk-provider-one",
        allowCrossOriginRedirects: true,
      },
    ));
    const firstProvider = (await firstProviderResponse.json()).provider as { id: string };
    const secondProviderResponse = await CREATE_PROVIDER(actionRequest(
      "http://localhost/api/ai/settings/providers",
      "POST",
      {
        providerName: "Provider Two",
        baseUrl: "https://two.example.com/v1",
        apiKey: "sk-provider-two",
      },
    ));
    expect(secondProviderResponse.status).toBe(201);

    for (const [modelKey, modelName] of [
      ["model-one", "Model One"],
      ["model-two", "Model Two"],
    ]) {
      const response = await CREATE_MODEL(
        actionRequest(
          `http://localhost/api/ai/settings/providers/${firstProvider.id}/models`,
          "POST",
          {
            modelKey,
            modelName,
            supportsStreaming: true,
            supportsToolCalls: true,
            contextWindow: 128_000,
            maxOutputTokens: 4_096,
          },
        ),
        { params: Promise.resolve({ providerId: firstProvider.id }) },
      );
      expect(response.status).toBe(201);
    }

    const settings = await GET_SETTINGS();
    const payload = await settings.json();
    expect(payload.providers).toHaveLength(2);
    expect(payload.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: firstProvider.id,
        allowCrossOriginRedirects: true,
        maskedApiKey: "••••-one",
        models: [
          expect.objectContaining({ modelKey: "model-one" }),
          expect.objectContaining({ modelKey: "model-two" }),
        ],
      }),
    ]));
    expect(payload.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerName: "Provider Two",
        allowCrossOriginRedirects: false,
      }),
    ]));
    expect(JSON.stringify(payload)).not.toContain("sk-provider-one");

    const available = await listAvailableAiModels(userId, ["user"]);
    expect(available.filter((model) => model.keySource === "user")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerModelKey: "model-one" }),
        expect.objectContaining({ providerModelKey: "model-two" }),
      ]),
    );
    expect(assertSafeAiEndpoint).toHaveBeenCalled();
  });

  it("enforces ownership and hides soft-deleted models and providers", async () => {
    const providerResponse = await CREATE_PROVIDER(actionRequest(
      "http://localhost/api/ai/settings/providers",
      "POST",
      {
        providerName: "Disposable Provider",
        baseUrl: "https://disposable.example.com/v1",
        apiKey: "sk-disposable",
      },
    ));
    const provider = (await providerResponse.json()).provider as { id: string };
    const modelResponse = await CREATE_MODEL(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}/models`,
        "POST",
        {
          modelKey: "disposable-model",
          modelName: "Disposable Model",
          supportsStreaming: true,
          supportsToolCalls: false,
          contextWindow: 64_000,
          maxOutputTokens: 2_048,
        },
      ),
      { params: Promise.resolve({ providerId: provider.id }) },
    );
    const model = (await modelResponse.json()).model as { id: string };

    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: `session-${otherUserId}`, userId: otherUserId },
      user: {
        id: otherUserId,
        name: otherUserId,
        email: `${otherUserId}@example.com`,
      },
    } as never);
    const forbidden = await UPDATE_MODEL(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}/models/${model.id}`,
        "PATCH",
        {
          modelKey: "stolen-model",
          modelName: "Stolen Model",
          enabled: false,
          supportsStreaming: true,
          supportsToolCalls: false,
          contextWindow: 64_000,
          maxOutputTokens: 2_048,
        },
      ),
      { params: Promise.resolve({ providerId: provider.id, modelId: model.id }) },
    );
    expect(forbidden.status).toBe(404);

    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: `session-${userId}`, userId },
      user: { id: userId, name: userId, email: `${userId}@example.com` },
    } as never);
    await UPDATE_MODEL(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}/models/${model.id}`,
        "PATCH",
        {
          modelKey: "disposable-model",
          modelName: "Disposable Model",
          enabled: false,
          supportsStreaming: true,
          supportsToolCalls: false,
          contextWindow: 64_000,
          maxOutputTokens: 2_048,
        },
      ),
      { params: Promise.resolve({ providerId: provider.id, modelId: model.id }) },
    );
    expect((await DELETE_MODEL(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}/models/${model.id}`,
        "DELETE",
      ),
      { params: Promise.resolve({ providerId: provider.id, modelId: model.id }) },
    )).status).toBe(204);

    await UPDATE_PROVIDER(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}`,
        "PATCH",
        {
          providerName: "Disposable Provider",
          baseUrl: "https://disposable.example.com/v1",
          enabled: false,
        },
      ),
      { params: Promise.resolve({ providerId: provider.id }) },
    );
    expect((await DELETE_PROVIDER(
      actionRequest(
        `http://localhost/api/ai/settings/providers/${provider.id}`,
        "DELETE",
      ),
      { params: Promise.resolve({ providerId: provider.id }) },
    )).status).toBe(204);

    const settings = await GET_SETTINGS();
    const payload = await settings.json();
    expect(payload.providers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: provider.id }),
    ]));
  });
});
