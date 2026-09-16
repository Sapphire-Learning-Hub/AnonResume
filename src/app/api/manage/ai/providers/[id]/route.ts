import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import {
  disableAiAdminProvider,
  saveAiAdminProvider,
} from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { aiAdminProviderSchema } from "@/lib/ai/admin/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

function requireProviderConfiguration() {
  const configuration = resolveAiConfiguration(process.env);
  if (!configuration.credentialsEncryptionKey) {
    throw new Error("ai_encryption_key_unavailable");
  }
  return {
    ...configuration,
    credentialsEncryptionKey: configuration.credentialsEncryptionKey,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    const value = aiAdminProviderSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    if (!value.model.id) throw new SyntaxError("model id is required");
    const configuration = requireProviderConfiguration();
    const result = await saveAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
      encryptionKey: configuration.credentialsEncryptionKey,
      trustedEndpointHostnames: configuration.trustedEndpointHostnames,
      value,
    });
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    await disableAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
