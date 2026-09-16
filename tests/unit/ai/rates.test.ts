import { calculateAiUsagePoints } from "@/lib/ai/usage/rates";

describe("AI point calculation", () => {
  it("charges cached input separately and rounds the combined result up", () => {
    expect(
      calculateAiUsagePoints({
        inputTokens: 2_000,
        cachedInputTokens: 500,
        outputTokens: 300,
        rates: {
          inputPointsPerMillion: 1_000,
          cachedInputPointsPerMillion: 100,
          outputPointsPerMillion: 5_000,
        },
      }),
    ).toBe(4);
  });

  it("rejects impossible or unsafe usage values", () => {
    expect(() =>
      calculateAiUsagePoints({
        inputTokens: 10,
        cachedInputTokens: 11,
        outputTokens: 0,
        rates: {
          inputPointsPerMillion: 1,
          cachedInputPointsPerMillion: 1,
          outputPointsPerMillion: 1,
        },
      }),
    ).toThrow("invalid_ai_usage");
  });
});
