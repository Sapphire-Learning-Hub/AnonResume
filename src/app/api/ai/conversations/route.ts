import { z } from "zod";

import type { AiProviderKind } from "@/db/ai-schema";
import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  createAiConversation,
  listAiConversations,
  listAvailableAiModels,
} from "@/lib/ai/conversations/repository";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const createConversationSchema = z
  .object({
    resumeId: z.string().min(1).max(200),
    modelId: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    contextScope: z.enum(["resume", "section"]),
    sectionId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contextScope === "section" && !value.sectionId) {
      context.addIssue({
        code: "custom",
        path: ["sectionId"],
        message: "Section context requires a section ID",
      });
    }
  });

function allowedKeySources(configuration: {
  platformEnabled: boolean;
  byokEnabled: boolean;
}) {
  const sources: AiProviderKind[] = [];
  if (configuration.platformEnabled) sources.push("platform");
  if (configuration.byokEnabled) sources.push("user");
  return sources;
}

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const resumeId = url.searchParams.get("resumeId");
  if (!resumeId) {
    return Response.json({ error: "invalid_ai_request" }, { status: 400 });
  }

  const runtime = await getRuntimeConfig("web");
  const configuration = resolveAiConfiguration(runtime.values);
  const [conversations, models] = await Promise.all([
    listAiConversations({
      userId: session.user.id,
      resumeId,
      includeArchived: url.searchParams.get("includeArchived") === "true",
    }),
    configuration.enabled
      ? listAvailableAiModels(
          session.user.id,
          allowedKeySources(configuration),
        )
      : [],
  ]);
  return Response.json({
    enabled: configuration.enabled && models.length > 0,
    conversations,
    models,
  });
}

export async function POST(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const runtime = await getRuntimeConfig("web");
    const configuration = resolveAiConfiguration(runtime.values);
    if (!configuration.enabled) throw new AiFeatureUnavailableError();
    const body = createConversationSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const conversation = await createAiConversation({
      userId: session.user.id,
      ...body,
      allowedKeySources: allowedKeySources(configuration),
    });
    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
