import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import { prepareAiRun } from "@/lib/ai/runs/service";
import { getAiWorkerAvailability } from "@/lib/ai/worker-availability";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const sendMessageSchema = z
  .object({
    message: z.string().trim().min(1).max(8_000),
    resumeVersion: z.number().int().positive(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configuration = resolveAiConfiguration(process.env);
    if (!configuration.enabled || !configuration.credentialsEncryptionKey) {
      throw new AiFeatureUnavailableError();
    }
    const worker = await getAiWorkerAvailability();
    if (!worker.available) throw new AiFeatureUnavailableError();

    const { id } = await params;
    const body = sendMessageSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const prepared = await prepareAiRun({
      userId: session.user.id,
      conversationId: id,
      message: body.message,
      resumeVersion: body.resumeVersion,
      configuration: {
        credentialsEncryptionKey: configuration.credentialsEncryptionKey,
        auditRetentionDays: configuration.auditRetentionDays,
        defaultMonthlyPoints: configuration.defaultMonthlyPoints,
        requestsPerMinute: configuration.requestsPerMinute,
        streamCheckpointMs: configuration.streamCheckpointMs,
        runLeaseSeconds: configuration.runLeaseSeconds,
        trustedEndpointHostnames: configuration.trustedEndpointHostnames,
        maxConcurrentRuns: configuration.maxConcurrentRuns,
        platformEnabled: configuration.platformEnabled,
        byokEnabled: configuration.byokEnabled,
      },
    });

    return Response.json({ runId: prepared.runId }, { status: 202 });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
