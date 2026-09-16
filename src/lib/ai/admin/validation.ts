import { z } from "zod";

export const aiAdminModelSchema = z.object({
  id: z.string().uuid().optional(),
  providerModelKey: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  supportsToolCalls: z.boolean(),
  contextWindow: z.number().int().positive().max(10_000_000),
  maxOutputTokens: z.number().int().positive().max(1_000_000),
  inputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cachedInputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const aiAdminProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(2_000),
  apiKey: z.string().trim().min(1).max(4_000).optional(),
  enabled: z.boolean(),
  model: aiAdminModelSchema,
}).strict();
