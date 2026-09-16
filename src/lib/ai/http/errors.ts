import { z } from "zod";

import {
  AiConversationNotFoundError,
  AiModelUnavailableError,
} from "@/lib/ai/conversations/repository";
import {
  AiRunAlreadyActiveError,
  AiRunRateLimitedError,
  AiRunVersionConflictError,
} from "@/lib/ai/runs/service";
import { AiQuotaExceededError } from "@/lib/ai/usage/ledger";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";

export class AiFeatureUnavailableError extends Error {
  constructor() {
    super("ai_unavailable");
    this.name = "AiFeatureUnavailableError";
  }
}

export function createAiErrorResponse(error: unknown) {
  if (error instanceof AiRunVersionConflictError) {
    return Response.json(
      {
        error: "ai_resume_version_conflict",
        currentVersion: error.currentVersion,
      },
      { status: 409 },
    );
  }
  if (error instanceof AiRunAlreadyActiveError) {
    return Response.json({ error: "ai_run_already_active" }, { status: 409 });
  }
  if (error instanceof AiQuotaExceededError) {
    return Response.json({ error: "ai_quota_exceeded" }, { status: 402 });
  }
  if (error instanceof AiRunRateLimitedError) {
    return Response.json({ error: "ai_rate_limited" }, { status: 429 });
  }
  if (
    error instanceof AiConversationNotFoundError ||
    error instanceof AiModelUnavailableError
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof AiFeatureUnavailableError) {
    return Response.json({ error: "ai_unavailable" }, { status: 503 });
  }
  if (error instanceof RequestBodyTooLargeError) {
    return Response.json({ error: "request_body_too_large" }, { status: 413 });
  }
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return Response.json({ error: "invalid_ai_request" }, { status: 400 });
  }
  return null;
}
