import { handleReviewRequest } from "@/lib/ai/review/api";
import { withRequestLogging } from "@/lib/observability/http";

export const GET = withRequestLogging("/api/ai/reviews", (request: Request) => handleReviewRequest("list", request));
export const POST = withRequestLogging("/api/ai/reviews", (request: Request) => handleReviewRequest("create", request));
