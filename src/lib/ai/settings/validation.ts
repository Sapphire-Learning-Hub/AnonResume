import { z } from "zod";

const providerBaseSchema = z.object({
  providerName: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(2_000),
});

export const createPersonalAiProviderSchema = providerBaseSchema.extend({
  apiKey: z.string().trim().min(1).max(4_000),
  allowCrossOriginRedirects: z.boolean().default(false),
}).strict();

export const updatePersonalAiProviderSchema = providerBaseSchema.extend({
  apiKey: z.string().trim().min(1).max(4_000).optional(),
  allowCrossOriginRedirects: z.boolean().optional(),
  enabled: z.boolean(),
}).strict();

const modelBaseSchema = z.object({
  modelKey: z.string().trim().min(1).max(200),
  modelName: z.string().trim().min(1).max(100),
  supportsStreaming: z.boolean(),
  supportsToolCalls: z.boolean(),
  contextWindow: z.number().int().positive().max(10_000_000),
  maxOutputTokens: z.number().int().positive().max(1_000_000),
});

export const createPersonalAiModelSchema = modelBaseSchema.strict();
export const updatePersonalAiModelSchema = modelBaseSchema.extend({
  enabled: z.boolean(),
}).strict();

export const testPersonalAiProviderSchema = z.object({
  providerId: z.string().uuid(),
  modelKey: z.string().trim().min(1).max(200),
}).strict();
