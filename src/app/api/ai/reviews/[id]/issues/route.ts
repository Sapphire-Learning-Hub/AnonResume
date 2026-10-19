import { handleReviewRequest } from "@/lib/ai/review/api";
import { withRequestLogging } from "@/lib/observability/http";

export const PATCH = withRequestLogging("/api/ai/reviews/[id]/issues", async (request: Request, context: { params: Promise<{ id: string }> }) => handleReviewRequest("issue", request, (await context.params).id));
