import {
  personalAiApiErrorResponse,
  requirePersonalAiApi,
} from "@/lib/ai/settings/api";
import {
  deletePersonalAiModel,
  updatePersonalAiModel,
} from "@/lib/ai/settings/service";
import { updatePersonalAiModelSchema } from "@/lib/ai/settings/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

interface RouteContext {
  params: Promise<{ providerId: string; modelId: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  try {
    const context = await requirePersonalAiApi();
    if (!context) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const { providerId, modelId } = await params;
    const value = updatePersonalAiModelSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const model = await updatePersonalAiModel({
      userId: context.userId,
      providerId,
      modelId,
      value,
    });
    return Response.json({ model });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  try {
    const context = await requirePersonalAiApi();
    if (!context) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const { providerId, modelId } = await params;
    await deletePersonalAiModel({
      userId: context.userId,
      providerId,
      modelId,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
