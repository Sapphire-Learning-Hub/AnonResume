import { z } from "zod";

import {
  AI_PROVIDER_TIMEOUT_LIMITS_SECONDS,
  DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS,
  isValidAiProviderTimeoutOrder,
} from "@/lib/ai/providers/timeout-policy";

const timeoutSecondsField = (
  limits: { min: number; max: number },
  fallback: number,
) => z.number().int().min(limits.min).max(limits.max).default(fallback);

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
  connectionTimeoutSeconds: timeoutSecondsField(
    AI_PROVIDER_TIMEOUT_LIMITS_SECONDS.connection,
    DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.connection,
  ),
  firstChunkTimeoutSeconds: timeoutSecondsField(
    AI_PROVIDER_TIMEOUT_LIMITS_SECONDS.firstChunk,
    DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.firstChunk,
  ),
  streamIdleTimeoutSeconds: timeoutSecondsField(
    AI_PROVIDER_TIMEOUT_LIMITS_SECONDS.streamIdle,
    DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.streamIdle,
  ),
  totalTimeoutSeconds: timeoutSecondsField(
    AI_PROVIDER_TIMEOUT_LIMITS_SECONDS.total,
    DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.total,
  ),
}).strict();

function validateTimeoutOrder(
  model: z.infer<typeof modelBaseSchema>,
  context: z.RefinementCtx,
) {
  if (!isValidAiProviderTimeoutOrder(model)) {
    context.addIssue({
      code: "custom",
      message: "total_timeout_must_cover_every_phase",
      path: ["totalTimeoutSeconds"],
    });
  }
}

export const createPersonalAiModelSchema = modelBaseSchema.superRefine(
  validateTimeoutOrder,
);
export const updatePersonalAiModelSchema = modelBaseSchema.extend({
  enabled: z.boolean(),
}).strict().superRefine(validateTimeoutOrder);

export const testPersonalAiProviderSchema = z.object({
  providerId: z.string().uuid(),
  modelKey: z.string().trim().min(1).max(200),
}).strict();
