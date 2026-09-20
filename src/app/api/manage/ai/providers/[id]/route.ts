import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import {
  deleteAiAdminProvider,
  saveAiAdminProvider,
} from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { aiAdminProviderSchema } from "@/lib/ai/admin/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

async function requireProviderConfiguration() {
  const runtime = await getRuntimeConfig("web");
  return resolveAiConfiguration(runtime.values);
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
    const configuration = await requireProviderConfiguration();
    const result = await saveAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
      credentialKeys: configuration.credentialKeys,
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
    await deleteAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
