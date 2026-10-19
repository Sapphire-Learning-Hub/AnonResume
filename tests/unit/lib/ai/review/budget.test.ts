import { createReviewBudget } from "@/lib/ai/review/budget";
import type { AiProviderRequest } from "@/lib/ai/providers/types";

const request: AiProviderRequest = { endpoint: new URL("https://models.example.com/v1"), apiKey: "secret", model: "fixture", messages: [{ role: "user", content: "Review this" }], maxOutputTokens: 10000 };

it("bounds individual requests and never resets the overall remaining deadline", () => {
  const budget = createReviewBudget();
  expect(budget.prepare(request, 64000, 90000)).toMatchObject({ maxOutputTokens: 2048, timeoutPolicy: { totalTimeoutMs: 90000 } });
  budget.recordUsage({ inputTokens: 10, outputTokens: 100, cachedInputTokens: 0 });
  expect(budget.prepare(request, 64000, 1500)).toMatchObject({ timeoutPolicy: { totalTimeoutMs: 1500, connectionTimeoutMs: 1500 } });
  expect(() => budget.prepare(request, 64000, 0)).toThrow("review_deadline");
});

it("charges unknown usage against the finite execution budget rather than treating it as zero", () => {
  const budget = createReviewBudget();
  for (let i = 0; i < 16; i++) { budget.prepare(request, 64000, 10000); budget.recordUsage(); }
  expect(() => budget.prepare(request, 64000, 10000)).toThrow("review_budget_exceeded");
});

it("bounds request attempts independently of known token usage and rejects oversized context before a call", () => {
  const budget = createReviewBudget();
  expect(() => budget.prepare({ ...request, messages: [{ role: "user", content: "中".repeat(30000) }] }, 64000, 10000)).toThrow("context_limit");
  for (let i = 0; i < 34; i++) { budget.prepare(request, 64000, 10000); budget.recordUsage({ inputTokens: 10, outputTokens: 1, cachedInputTokens: 0 }); }
  expect(() => budget.prepare(request, 64000, 10000)).toThrow("review_round_limit");
});
