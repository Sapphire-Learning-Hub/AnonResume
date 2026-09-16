import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import {
  disablePersonalAiSettings,
  getPersonalAiSettings,
  savePersonalAiSettings,
} from "@/lib/ai/settings/service";
import { getAiQuotaSnapshot } from "@/lib/ai/usage/ledger";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const personalSettingsSchema = z
  .object({
    providerName: z.string().trim().min(1).max(100),
    baseUrl: z.string().url().max(2_000),
    apiKey: z.string().trim().min(1).max(4_000).optional(),
    modelKey: z.string().trim().min(1).max(200),
    modelName: z.string().trim().min(1).max(100),
    supportsToolCalls: z.boolean(),
  })
  .strict();

function requireEnabledConfiguration() {
  const configuration = resolveAiConfiguration(process.env);
  if (!configuration.enabled || !configuration.credentialsEncryptionKey) {
    throw new AiFeatureUnavailableError();
  }
  return {
    ...configuration,
    credentialsEncryptionKey: configuration.credentialsEncryptionKey,
  };
}

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configuration = requireEnabledConfiguration();
    const [personal, quota] = await Promise.all([
      getPersonalAiSettings({
        userId: session.user.id,
        encryptionKey: configuration.credentialsEncryptionKey,
      }),
      getAiQuotaSnapshot(session.user.id),
    ]);
    return Response.json({
      platformEnabled: configuration.platformEnabled,
      byokEnabled: configuration.byokEnabled,
      defaultMonthlyPoints: configuration.defaultMonthlyPoints,
      quota,
      personal,
    });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PUT(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configuration = requireEnabledConfiguration();
    if (!configuration.byokEnabled) throw new AiFeatureUnavailableError();
    const body = personalSettingsSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    await savePersonalAiSettings({
      userId: session.user.id,
      encryptionKey: configuration.credentialsEncryptionKey,
      ...body,
    });
    const personal = await getPersonalAiSettings({
      userId: session.user.id,
      encryptionKey: configuration.credentialsEncryptionKey,
    });
    return Response.json({ personal });
  } catch (error) {
    if (error instanceof Error && error.message === "unsafe_ai_endpoint") {
      return Response.json({ error: "unsafe_ai_endpoint" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ai_api_key_required") {
      return Response.json({ error: "ai_api_key_required" }, { status: 400 });
    }
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  await disablePersonalAiSettings(session.user.id);
  return new Response(null, { status: 204 });
}
