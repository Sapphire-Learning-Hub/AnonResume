import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { aiProviderCredentials, db } from "@/db";
import { getOptionalSession } from "@/lib/auth/session";
import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";

import { DELETE, GET, PUT } from "@/app/api/ai/settings/route";

vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/ai/security/endpoint-policy", () => ({
  assertSafeAiEndpoint: vi.fn(async (value: string | URL) => new URL(value)),
}));

describe("personal AI settings route", () => {
  const userId = `ai-settings-${randomUUID()}`;
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

  it("stores an encrypted personal key and returns only a masked value", async () => {
    const saveResponse = await PUT(
      new Request("http://localhost/api/ai/settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          providerName: "My provider",
          baseUrl: "https://models.example.com/v1",
          apiKey: "sk-personal-secret",
          modelKey: "personal-model",
          modelName: "Personal model",
          supportsToolCalls: true,
        }),
      }),
    );
    expect(saveResponse.status).toBe(200);
    expect(assertSafeAiEndpoint).toHaveBeenCalled();

    const response = await GET();
    const payload = await response.json();
    expect(payload.personal).toMatchObject({
      providerName: "My provider",
      baseUrl: "https://models.example.com/v1",
      maskedApiKey: "••••cret",
      modelKey: "personal-model",
      supportsToolCalls: true,
      enabled: true,
    });
    expect(JSON.stringify(payload)).not.toContain("sk-personal-secret");

    const disabled = await DELETE(
      new Request("http://localhost/api/ai/settings", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(disabled.status).toBe(204);
    const afterDisable = await GET();
    expect((await afterDisable.json()).personal.enabled).toBe(false);
  });
});
