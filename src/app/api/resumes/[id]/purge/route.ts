import { withRequestLogging } from "@/lib/observability/http";
import {
  handleTrashMutation,
  withResumeLifecycleErrors,
} from "@/lib/resume/trash/http";

export const POST = withRequestLogging(
  "/api/resumes/[id]/purge",
  withResumeLifecycleErrors(
    (request: Request, context: { params: Promise<{ id: string }> }) =>
      handleTrashMutation(request, context, "purge"),
  ),
);
