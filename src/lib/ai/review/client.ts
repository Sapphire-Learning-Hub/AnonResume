import { z } from "zod";
import { AiClientError } from "@/lib/ai/client";
import type { AiReviewInput } from "@/domain/resume/ai/review/schema";
import { reviewDetailsSchema, reviewPageSchema, type ReviewPage } from "./validation";

async function request<T>(path: string, schema: z.ZodType<T>, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/ai/reviews${path}`, { method, signal, cache: "no-store", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string(), currentVersion: z.number().optional() }).safeParse(payload);
    throw new AiClientError(error.success ? error.data.error : "ai_request_failed", response.status, error.success ? error.data.currentVersion : undefined);
  }
  return schema.parse(payload);
}

export function listResumeReviews(resumeId: string, signal?: AbortSignal, cursor?: ReviewPage["nextCursor"]) {
  const query = new URLSearchParams({ resumeId });
  if (cursor) query.set("cursor", JSON.stringify(cursor));
  return request(`?${query}`, reviewPageSchema, "GET", undefined, signal);
}
export function getResumeReview(id: string, signal?: AbortSignal) { return request(`/${id}`, reviewDetailsSchema, "GET", undefined, signal); }
export function startResumeReview(resumeId: string, input: AiReviewInput) { return request("", z.object({ reviewId: z.string().uuid(), runId: z.string().uuid() }), "POST", { resumeId, ...input }); }
export function ignoreReviewIssue(id: string, issueId: string, ignored: boolean) { return request(`/${id}/issues`, reviewDetailsSchema, "PATCH", { issueId, ignored }); }
export function deleteResumeReview(id: string) { return request(`/${id}`, z.object({ deleted: z.literal(true) }), "DELETE"); }
export function generateReviewSuggestions(id: string, issueIds: string[], resumeVersion: number, supplementalFacts?: string) { return request(`/${id}/suggestions`, z.object({ conversationId: z.string().uuid(), runId: z.string().uuid() }), "POST", { issueIds, resumeVersion, supplementalFacts }); }
