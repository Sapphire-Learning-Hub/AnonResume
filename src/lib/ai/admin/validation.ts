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

export const aiAdminModelSchema = z.object({
  id: z.string().uuid().optional(),
  providerModelKey: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
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
  freeModel: z.boolean(),
  inputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cachedInputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputPointRate: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().superRefine((model, context) => {
  if (!isValidAiProviderTimeoutOrder(model)) {
    context.addIssue({
      code: "custom",
      message: "total_timeout_must_cover_every_phase",
      path: ["totalTimeoutSeconds"],
    });
  }
  const rates = [
    model.inputPointRate,
    model.cachedInputPointRate,
    model.outputPointRate,
  ];
  if (!model.freeModel && rates.every((rate) => rate === 0)) {
    context.addIssue({
      code: "custom",
      message: "metered_model_requires_point_rate",
      path: ["inputPointRate"],
    });
  }
  if (model.freeModel && rates.some((rate) => rate !== 0)) {
    context.addIssue({
      code: "custom",
      message: "free_model_requires_zero_rates",
      path: ["inputPointRate"],
    });
  }
});

export const aiAdminProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(2_000),
  apiKey: z.string().trim().min(1).max(4_000).optional(),
  allowCrossOriginRedirects: z.boolean().default(false),
  enabled: z.boolean(),
}).strict();
