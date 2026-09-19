import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import {
  PersonalAiResourceNotFoundError,
  PersonalAiStateConflictError,
} from "@/lib/ai/settings/service";

export async function requirePersonalAiApi() {
  const session = await getOptionalSession();
  if (!session) return null;
  const runtime = await getRuntimeConfig("web");
  const configuration = resolveAiConfiguration(runtime.values);
  if (
    !configuration.enabled ||
    !configuration.byokEnabled
  ) {
    throw new AiFeatureUnavailableError();
  }
  return {
    userId: session.user.id,
    encryptionKey: configuration.credentialsEncryptionKey,
    trustedEndpointHostnames: configuration.trustedEndpointHostnames,
  };
}

export function personalAiApiErrorResponse(error: unknown) {
  if (error instanceof PersonalAiResourceNotFoundError) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof PersonalAiStateConflictError) {
    return Response.json(
      { error: "ai_resource_state_conflict" },
      { status: 409 },
    );
  }
  if (error instanceof Error && error.message === "unsafe_ai_endpoint") {
    return Response.json({ error: "unsafe_ai_endpoint" }, { status: 400 });
  }
  if (error instanceof Error && error.message === "ai_api_key_required") {
    return Response.json({ error: "ai_api_key_required" }, { status: 400 });
  }
  return createAiErrorResponse(error);
}
