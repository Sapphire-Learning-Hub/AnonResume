import { z } from "zod";
import { reviewInputSchema } from "@/domain/resume/ai/review/schema";
import { getOptionalSession } from "@/lib/auth/session";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getAiWorkerAvailability } from "@/lib/ai/worker-availability";
import { AiFeatureUnavailableError, createAiErrorResponse } from "@/lib/ai/http/errors";
import { AiProviderError } from "@/lib/ai/providers/types";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { parseLimitedJsonRequest, MAX_ACTION_REQUEST_BYTES } from "@/lib/http/request-body";
import { prepareResumeReviewRun } from "./service";
import { deleteOwnedResumeReview, getOwnedResumeReview, listOwnedResumeReviews, prepareReviewSuggestions, setOwnedReviewIssueIgnored, ReviewFactsRequiredError } from "./repository";
import { reviewCursorSchema } from "./validation";

type Action = "list" | "create" | "get" | "delete" | "issue" | "suggest";
const creation = reviewInputSchema.extend({ resumeId: z.string().min(1).max(200) }).strict();
const ignore = z.object({ issueId: z.string().min(1).max(100), ignored: z.boolean() }).strict();
const suggestions = z.object({ issueIds: z.array(z.string().min(1).max(100)).min(1).max(40), resumeVersion: z.number().int().positive(), supplementalFacts: z.string().trim().max(8000).optional() }).strict();

async function configuration() {
  const runtime = await getRuntimeConfig("web");
  const resolved = resolveAiConfiguration(runtime.values);
  if (!resolved.enabled || !(await getAiWorkerAvailability({ pollIntervalMs: runtime.values.aiWorkerPollIntervalMs })).available) throw new AiFeatureUnavailableError();
  return resolved;
}

export async function handleReviewRequest(action: Action, request: Request, reviewId?: string) {
  if (["create", "delete", "issue", "suggest"].includes(action)) {
    const forbidden = requireSameOrigin(request);
    if (forbidden) return forbidden;
  }
  const session = await getOptionalSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;
  try {
    if (action === "list") {
      const query = new URL(request.url).searchParams;
      const resumeId = z.string().min(1).max(200).parse(query.get("resumeId"));
      const cursorValue = query.get("cursor");
      const cursor = cursorValue ? reviewCursorSchema.parse(JSON.parse(cursorValue)) : undefined;
      const limit = z.coerce.number().int().min(1).max(50).parse(query.get("limit") ?? 20);
      return Response.json(await listOwnedResumeReviews({ userId, resumeId, cursor, limit }), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (action === "create") {
      const { resumeId, ...input } = creation.parse(await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES));
      const prepared = await prepareResumeReviewRun({ userId, resumeId, input, configuration: await configuration() });
      return Response.json({ reviewId: prepared.reviewId, runId: prepared.runId }, { status: 202 });
    }
    const id = z.string().uuid().parse(reviewId);
    if (action === "get") {
      const result = await getOwnedResumeReview({ userId, reviewId: id });
      return result ? Response.json(result, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (action === "delete") {
      const deleted = await deleteOwnedResumeReview({ userId, reviewId: id });
      return deleted ? Response.json({ deleted: true }) : Response.json({ error: "not_found" }, { status: 404 });
    }
    const body = await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES);
    if (action === "issue") return Response.json(await setOwnedReviewIssueIgnored({ userId, reviewId: id, ...ignore.parse(body) }));
    return Response.json(await prepareReviewSuggestions({ userId, reviewId: id, ...suggestions.parse(body), configuration: await configuration() }), { status: 202 });
  } catch (error) {
    if (error instanceof ReviewFactsRequiredError) return Response.json({ error: error.code }, { status: 422 });
    if (error instanceof AiProviderError) return Response.json({ error: error.code === "context_limit" ? "ai_review_context_limit" : "ai_review_empty" }, { status: 422 });
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
