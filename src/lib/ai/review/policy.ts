export const REVIEW_EXECUTION_POLICY = Object.freeze({
  version: 1 as const, maxRounds: 32, maxRequests: 34, maxTimeoutRetries: 2,
  maxCorrections: 2, maxOutputPerRequest: 2048, maxOutputTokens: 32768,
  maxInputUnits: 512000, maxRequestMs: 120000, maxResponseCharacters: 16000,
});
export class ReviewExecutionError extends Error {
  constructor(public readonly code: "review_round_limit" | "review_budget_exceeded" | "review_deadline" | "execution_upgrade_required") {
    super(code);
    this.name = "ReviewExecutionError";
  }
}
