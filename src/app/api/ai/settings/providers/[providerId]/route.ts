import {
  personalAiApiErrorResponse,
  requirePersonalAiApi,
} from "@/lib/ai/settings/api";
import {
  deletePersonalAiProvider,
  updatePersonalAiProvider,
} from "@/lib/ai/settings/service";
import { updatePersonalAiProviderSchema } from "@/lib/ai/settings/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

interface RouteContext {
  params: Promise<{ providerId: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  try {
    const context = await requirePersonalAiApi();
    if (!context) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const { providerId } = await params;
    const value = updatePersonalAiProviderSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const provider = await updatePersonalAiProvider({
      ...context,
      providerId,
      value,
    });
    return Response.json({ provider });
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
    const { providerId } = await params;
    await deletePersonalAiProvider({ userId: context.userId, providerId });
    return new Response(null, { status: 204 });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
