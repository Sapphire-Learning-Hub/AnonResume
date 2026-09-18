export interface AiPointRates {
  inputPointsPerMillion: number;
  cachedInputPointsPerMillion: number;
  outputPointsPerMillion: number;
}

function nonNegativeSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function calculateAiUsagePoints({
  inputTokens,
  cachedInputTokens,
  outputTokens,
  rates,
}: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  rates: AiPointRates;
}) {
  const values = [
    inputTokens,
    cachedInputTokens,
    outputTokens,
    rates.inputPointsPerMillion,
    rates.cachedInputPointsPerMillion,
    rates.outputPointsPerMillion,
  ];
  if (
    values.some((value) => !nonNegativeSafeInteger(value)) ||
    cachedInputTokens > inputTokens
  ) {
    throw new Error("invalid_ai_usage");
  }

  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const numerator =
    uncachedInputTokens * rates.inputPointsPerMillion +
    cachedInputTokens * rates.cachedInputPointsPerMillion +
    outputTokens * rates.outputPointsPerMillion;
  if (!Number.isSafeInteger(numerator)) {
    throw new Error("invalid_ai_usage");
  }

  return Math.ceil(numerator / 1_000_000);
}
