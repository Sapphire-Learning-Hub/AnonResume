import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import {
  deleteAiConversation,
  getAiConversationDetails,
  renameAiConversation,
  setAiConversationArchived,
} from "@/lib/ai/conversations/repository";
import { createAiErrorResponse } from "@/lib/ai/http/errors";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.archived !== undefined);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    return Response.json(
      await getAiConversationDetails({
        userId: session.user.id,
        conversationId: id,
      }),
    );
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(
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
    const body = updateConversationSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    let conversation;
    if (body.title !== undefined) {
      conversation = await renameAiConversation({
        userId: session.user.id,
        conversationId: id,
        title: body.title,
      });
    }
    if (body.archived !== undefined) {
      conversation = await setAiConversationArchived({
        userId: session.user.id,
        conversationId: id,
        archived: body.archived,
      });
    }
    return Response.json({ conversation });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
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
    await deleteAiConversation({
      userId: session.user.id,
      conversationId: id,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
