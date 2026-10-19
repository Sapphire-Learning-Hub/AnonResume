import { handleReviewRequest } from "@/lib/ai/review/api";
import { withRequestLogging } from "@/lib/observability/http";

type Context = { params: Promise<{ id: string }> };
export const GET = withRequestLogging("/api/ai/reviews/[id]", async (request: Request, context: Context) => handleReviewRequest("get", request, (await context.params).id));
export const DELETE = withRequestLogging("/api/ai/reviews/[id]", async (request: Request, context: Context) => handleReviewRequest("delete", request, (await context.params).id));
