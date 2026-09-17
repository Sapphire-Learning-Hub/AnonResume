import {
  personalAiApiErrorResponse,
  requirePersonalAiApi,
} from "@/lib/ai/settings/api";
import { createPersonalAiProvider } from "@/lib/ai/settings/service";
import { createPersonalAiProviderSchema } from "@/lib/ai/settings/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

export async function POST(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  try {
    const context = await requirePersonalAiApi();
    if (!context) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const value = createPersonalAiProviderSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const provider = await createPersonalAiProvider({ ...context, value });
    return Response.json({ provider }, { status: 201 });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
