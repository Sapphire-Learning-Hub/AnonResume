import {
  aiAdminModelSchema,
  aiAdminProviderSchema,
} from "@/lib/ai/admin/validation";
import { DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS } from "@/lib/ai/providers/timeout-policy";

const provider = {
  displayName: "Example provider",
  baseUrl: "https://example.com/v1",
  apiKey: "secret",
  enabled: true,
};

const model = {
  providerModelKey: "example-model",
  displayName: "Example model",
  enabled: true,
  supportsToolCalls: true,
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  inputPointRate: 0,
  cachedInputPointRate: 0,
  outputPointRate: 0,
};

describe("AI administration validation", () => {
  it("rejects a metered model when every point rate is zero", () => {
    expect(aiAdminModelSchema.safeParse({
      ...model,
      freeModel: false,
    }).success).toBe(false);
  });

  it("accepts zero rates only when the model is explicitly free", () => {
    const result = aiAdminModelSchema.safeParse({
      ...model,
      freeModel: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        connectionTimeoutSeconds:
          DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.connection,
        firstChunkTimeoutSeconds:
          DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.firstChunk,
        streamIdleTimeoutSeconds:
          DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.streamIdle,
        totalTimeoutSeconds: DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.total,
      });
    }
  });

  it("rejects a total timeout shorter than an execution phase", () => {
    expect(aiAdminModelSchema.safeParse({
      ...model,
      freeModel: true,
      firstChunkTimeoutSeconds: 120,
      totalTimeoutSeconds: 60,
    }).success).toBe(false);
  });

  it("keeps provider validation independent from model configuration", () => {
    expect(aiAdminProviderSchema.safeParse(provider).success).toBe(true);
    expect(aiAdminProviderSchema.safeParse({
      ...provider,
      model: { ...model, freeModel: true },
    }).success).toBe(false);
  });
});
