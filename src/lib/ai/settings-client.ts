import { z } from "zod";

const personalSchema = z
  .object({
    providerName: z.string(),
    baseUrl: z.string(),
    maskedApiKey: z.string(),
    modelKey: z.string(),
    modelName: z.string(),
    supportsToolCalls: z.boolean(),
    enabled: z.boolean(),
  })
  .nullable();

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
  personal: personalSchema,
});

export type AiSettingsSnapshot = z.infer<typeof settingsSchema>;

export interface PersonalAiSettingsInput {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  modelKey: string;
  modelName: string;
  supportsToolCalls: boolean;
}

async function responseJson(response: Response) {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(error.success ? error.data.error : "ai_request_failed");
  }
  return payload;
}

export async function fetchAiSettings() {
  return settingsSchema.parse(
    await responseJson(
      await fetch("/api/ai/settings", { cache: "no-store" }),
    ),
  );
}

export async function saveAiSettings(input: PersonalAiSettingsInput) {
  const payload = await responseJson(
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return z.object({ personal: personalSchema }).parse(payload);
}

export async function disableAiSettings() {
  const response = await fetch("/api/ai/settings", { method: "DELETE" });
  if (!response.ok) await responseJson(response);
}

export async function testAiSettings(input: PersonalAiSettingsInput) {
  const payload = await responseJson(
    await fetch("/api/ai/settings/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return z.object({ connected: z.literal(true) }).parse(payload);
}
