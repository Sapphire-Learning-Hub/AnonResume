import {
  personalAiApiErrorResponse,
  requirePersonalAiApi,
} from "@/lib/ai/settings/api";
import { testPersonalAiProvider } from "@/lib/ai/settings/service";
import { testPersonalAiProviderSchema } from "@/lib/ai/settings/validation";
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
    const body = testPersonalAiProviderSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    await testPersonalAiProvider({ ...context, ...body });
    return Response.json({ connected: true });
  } catch (error) {
    const response = personalAiApiErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "ai_connection_failed" }, { status: 502 });
  }
}
