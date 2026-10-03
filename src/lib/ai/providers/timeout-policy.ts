export interface AiProviderTimeoutPolicy {
  connectionTimeoutMs: number;
  firstChunkTimeoutMs: number;
  streamIdleTimeoutMs: number;
  totalTimeoutMs: number;
}

export interface AiProviderTimeoutSeconds {
  connectionTimeoutSeconds: number;
  firstChunkTimeoutSeconds: number;
  streamIdleTimeoutSeconds: number;
  totalTimeoutSeconds: number;
}

export const DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS = Object.freeze({
  connection: 30,
  firstChunk: 300,
  streamIdle: 90,
  total: 600,
});

export const AI_PROVIDER_TIMEOUT_LIMITS_SECONDS = Object.freeze({
  connection: { min: 1, max: 120 },
  firstChunk: { min: 1, max: 600 },
  streamIdle: { min: 1, max: 300 },
  total: { min: 10, max: 1_800 },
});

export const DEFAULT_AI_PROVIDER_TIMEOUT_POLICY: Readonly<AiProviderTimeoutPolicy> =
  Object.freeze({
    connectionTimeoutMs:
      DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.connection * 1_000,
    firstChunkTimeoutMs:
      DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.firstChunk * 1_000,
    streamIdleTimeoutMs:
      DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.streamIdle * 1_000,
    totalTimeoutMs: DEFAULT_AI_PROVIDER_TIMEOUT_SECONDS.total * 1_000,
  });

export function aiProviderTimeoutPolicyFromSeconds(
  input: AiProviderTimeoutSeconds,
): AiProviderTimeoutPolicy {
  return {
    connectionTimeoutMs: input.connectionTimeoutSeconds * 1_000,
    firstChunkTimeoutMs: input.firstChunkTimeoutSeconds * 1_000,
    streamIdleTimeoutMs: input.streamIdleTimeoutSeconds * 1_000,
    totalTimeoutMs: input.totalTimeoutSeconds * 1_000,
  };
}

export function isValidAiProviderTimeoutOrder(
  input: AiProviderTimeoutSeconds,
) {
  return input.totalTimeoutSeconds >= Math.max(
    input.connectionTimeoutSeconds,
    input.firstChunkTimeoutSeconds,
    input.streamIdleTimeoutSeconds,
  );
}
