import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { AiFeatureUnavailableError, createAiErrorResponse } from "@/lib/ai/http/errors";
import { testPersonalAiSettings } from "@/lib/ai/settings/service";
import { MAX_ACTION_REQUEST_BYTES, parseLimitedJsonRequest } from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const testSettingsSchema = z
  .object({
    providerName: z.string().trim().min(1).max(100),
    baseUrl: z.string().url().max(2_000),
    apiKey: z.string().trim().min(1).max(4_000).optional(),
    modelKey: z.string().trim().min(1).max(200),
    modelName: z.string().trim().min(1).max(100),
    supportsToolCalls: z.boolean(),
  })
  .strict();

export async function POST(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;
  const session = await getOptionalSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const configuration = resolveAiConfiguration(process.env);
    if (
      !configuration.enabled ||
      !configuration.byokEnabled ||
      !configuration.credentialsEncryptionKey
    ) {
      throw new AiFeatureUnavailableError();
    }
    const body = testSettingsSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    await testPersonalAiSettings({
      userId: session.user.id,
      encryptionKey: configuration.credentialsEncryptionKey,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      modelKey: body.modelKey,
    });
    return Response.json({ connected: true });
  } catch (error) {
    if (error instanceof Error && error.message === "unsafe_ai_endpoint") {
      return Response.json({ error: "unsafe_ai_endpoint" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ai_api_key_required") {
      return Response.json({ error: "ai_api_key_required" }, { status: 400 });
    }
    const response = createAiErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "ai_connection_failed" }, { status: 502 });
  }
}
