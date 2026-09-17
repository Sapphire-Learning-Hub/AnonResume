import {
  aiAdminModelSchema,
  aiAdminProviderSchema,
} from "@/lib/ai/admin/validation";

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
    expect(aiAdminModelSchema.safeParse({
      ...model,
      freeModel: true,
    }).success).toBe(true);
  });

  it("keeps provider validation independent from model configuration", () => {
    expect(aiAdminProviderSchema.safeParse(provider).success).toBe(true);
    expect(aiAdminProviderSchema.safeParse({
      ...provider,
      model: { ...model, freeModel: true },
    }).success).toBe(false);
  });
});
