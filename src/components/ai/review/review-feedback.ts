import type { MessageKey } from "@/i18n/messages";
import type { AiRunProgressStage } from "@/lib/ai/runs/stream-events";

export function reviewFailureMessage(code: string | null): MessageKey {
  switch (code) {
    case "timeout": return "aiReview.timeoutError";
    case "review_deadline": return "aiReview.deadlineError";
    case "review_budget_exceeded": return "aiReview.budgetError";
    case "review_round_limit": return "aiReview.roundError";
    case "execution_upgrade_required": return "aiReview.upgradeError";
    case "invalid_response": return "aiReview.protocolError";
    case "context_limit": return "aiReview.contextError";
    case "authentication": return "aiReview.authenticationError";
    case "rate_limited": return "aiReview.rateError";
    case "unavailable": return "aiReview.upstreamUnavailable";
    case "lease_expired": return "aiReview.interruptedError";
    case "stopped": return "aiReview.stopped";
    default: return "aiReview.failed";
  }
}

export function reviewProgressMessage(stage?: AiRunProgressStage): MessageKey {
  switch (stage) {
    case "retrying_upstream": return "aiReview.retrying";
    case "review_reading": return "aiReview.reading";
    case "review_matching": return "aiReview.matching";
    case "saving_result": return "ai.progress.saving";
    case "validating_result": case "revalidating_result": return "ai.progress.validating";
    case "repairing_changes": return "ai.progress.repairing";
    default: return "ai.analyzing";
  }
}
