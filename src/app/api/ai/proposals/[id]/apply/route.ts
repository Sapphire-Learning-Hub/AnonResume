import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { createAiErrorResponse } from "@/lib/ai/http/errors";
import { markAiProposalApplied } from "@/lib/ai/proposals/repository";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const appliedProposalSchema = z
  .object({
    selectedChangeIds: z.array(z.string().min(1).max(100)).min(1).max(50),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = appliedProposalSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const result = await markAiProposalApplied({
      userId: session.user.id,
      proposalId: id,
      selectedChangeIds: body.selectedChangeIds,
    });
    return Response.json(result);
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
