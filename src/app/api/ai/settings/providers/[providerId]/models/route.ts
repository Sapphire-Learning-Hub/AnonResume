import {
  personalAiApiErrorResponse,
  requirePersonalAiApi,
} from "@/lib/ai/settings/api";
import { createPersonalAiModel } from "@/lib/ai/settings/service";
import { createPersonalAiModelSchema } from "@/lib/ai/settings/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  try {
    const context = await requirePersonalAiApi();
    if (!context) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const { providerId } = await params;
    const value = createPersonalAiModelSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const model = await createPersonalAiModel({
      userId: context.userId,
      providerId,
      value,
    });
    return Response.json({ model }, { status: 201 });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
