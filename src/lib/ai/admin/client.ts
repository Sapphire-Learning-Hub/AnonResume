import { z } from "zod";

const pointRateSchema = z.string().regex(/^\d+$/);

const aiAdminModelRateVersionSchema = z.object({
  version: z.number().int().positive(),
  inputPointRate: pointRateSchema,
  cachedInputPointRate: pointRateSchema,
  outputPointRate: pointRateSchema,
  createdAt: z.string().datetime(),
  current: z.boolean(),
});

const aiAdminModelRateHistorySchema = z.object({
  modelId: z.string(),
  currentVersion: z.number().int().positive(),
  versions: z.array(aiAdminModelRateVersionSchema),
});

export type AiAdminModelRateVersion = z.infer<
  typeof aiAdminModelRateVersionSchema
>;

export type AiAdminModelRateHistory = z.infer<
  typeof aiAdminModelRateHistorySchema
>;

export async function fetchAiAdminModelRateVersions(
  providerId: string,
  modelId: string,
) {
  const response = await fetch(
    `/api/manage/ai/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}/rate-versions`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("ai_rate_history_load_failed");
  return aiAdminModelRateHistorySchema.parse(await response.json());
}
