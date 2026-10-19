import { handleReviewRequest } from "@/lib/ai/review/api";
import { withRequestLogging } from "@/lib/observability/http";

export const POST = withRequestLogging("/api/ai/reviews/[id]/suggestions", async (request: Request, context: { params: Promise<{ id: string }> }) => handleReviewRequest("suggest", request, (await context.params).id));
