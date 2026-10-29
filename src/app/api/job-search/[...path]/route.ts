import { withRequestLogging } from "@/lib/observability/http";
import { handleJobRequest } from "@/lib/job-search/http";
export const GET = withRequestLogging(
  "/api/job-search/[...path]",
  handleJobRequest,
);
export const POST = withRequestLogging(
  "/api/job-search/[...path]",
  handleJobRequest,
);
export const PATCH = withRequestLogging(
  "/api/job-search/[...path]",
  handleJobRequest,
);
export const PUT = withRequestLogging(
  "/api/job-search/[...path]",
  handleJobRequest,
);
export const DELETE = withRequestLogging(
  "/api/job-search/[...path]",
  handleJobRequest,
);
