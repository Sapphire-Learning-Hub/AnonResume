import { z } from "zod";

const personalModelSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  modelKey: z.string(),
  modelName: z.string(),
  enabled: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsToolCalls: z.boolean(),
  contextWindow: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
});

const personalProviderSchema = z.object({
  id: z.string().uuid(),
  providerName: z.string(),
  baseUrl: z.string(),
  maskedApiKey: z.string(),
  enabled: z.boolean(),
  models: z.array(personalModelSchema),
});

const settingsSchema = z.object({
  platformEnabled: z.boolean(),
  byokEnabled: z.boolean(),
  defaultMonthlyPoints: z.number().int().nonnegative(),
  quota: z
    .object({
      monthlyLimit: z.number(),
      usedPoints: z.number(),
      reservedPoints: z.number(),
      availablePoints: z.number(),
      periodStartedAt: z.string(),
      periodEndsAt: z.string(),
    })
    .nullable(),
  providers: z.array(personalProviderSchema),
});

export type AiSettingsSnapshot = z.infer<typeof settingsSchema>;
export type PersonalAiProvider = z.infer<typeof personalProviderSchema>;
export type PersonalAiModel = z.infer<typeof personalModelSchema>;

export interface PersonalAiProviderInput {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface PersonalAiModelInput {
  modelKey: string;
  modelName: string;
  enabled?: boolean;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

async function responseJson(response: Response) {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(error.success ? error.data.error : "ai_request_failed");
  }
  return payload;
}

async function request(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  return responseJson(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function remove(url: string) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) await responseJson(response);
}

export async function fetchAiSettings() {
  return settingsSchema.parse(
    await responseJson(
      await fetch("/api/ai/settings", { cache: "no-store" }),
    ),
  );
}

export async function createPersonalAiProvider(
  input: PersonalAiProviderInput & { apiKey: string },
) {
  const payload = await request("/api/ai/settings/providers", "POST", input);
  return z.object({ provider: personalProviderSchema }).parse(payload).provider;
}

export async function updatePersonalAiProvider(
  providerId: string,
  input: PersonalAiProviderInput & { enabled: boolean },
) {
  const payload = await request(
    `/api/ai/settings/providers/${encodeURIComponent(providerId)}`,
    "PATCH",
    input,
  );
  return z.object({ provider: personalProviderSchema }).parse(payload).provider;
}

export async function deletePersonalAiProvider(providerId: string) {
  await remove(
    `/api/ai/settings/providers/${encodeURIComponent(providerId)}`,
  );
}

export async function createPersonalAiModel(
  providerId: string,
  input: PersonalAiModelInput,
) {
  const payload = await request(
    `/api/ai/settings/providers/${encodeURIComponent(providerId)}/models`,
    "POST",
    input,
  );
  return z.object({ model: personalModelSchema }).parse(payload).model;
}

export async function updatePersonalAiModel(
  providerId: string,
  modelId: string,
  input: PersonalAiModelInput & { enabled: boolean },
) {
  const payload = await request(
    `/api/ai/settings/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`,
    "PATCH",
    input,
  );
  return z.object({ model: personalModelSchema }).parse(payload).model;
}

export async function deletePersonalAiModel(
  providerId: string,
  modelId: string,
) {
  await remove(
    `/api/ai/settings/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`,
  );
}

export async function testPersonalAiModel(
  providerId: string,
  modelKey: string,
) {
  const payload = await request("/api/ai/settings/test", "POST", {
    providerId,
    modelKey,
  });
  return z.object({ connected: z.literal(true) }).parse(payload);
}
