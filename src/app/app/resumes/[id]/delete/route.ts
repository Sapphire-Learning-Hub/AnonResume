import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { createApplicationUrl, requireSameOrigin } from "@/lib/http/request-origin";
import {
  deleteResumeRecord,
} from "@/lib/resume/repository";
import { assertAccountMergeMutationAllowed } from "@/lib/auth/account/merge/executor";
import { withResumeLifecycleErrors } from "@/lib/resume/trash/http";

async function post(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await requireSession();
  const { id } = await params;
  await assertAccountMergeMutationAllowed(session.user.id);
  await deleteResumeRecord(session.user.id, id);

  return NextResponse.redirect(createApplicationUrl("/app", request), {
    status: 303,
  });
}
export const POST = withResumeLifecycleErrors(post);
