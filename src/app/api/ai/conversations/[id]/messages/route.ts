import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";
import { executePreparedAiRun } from "@/lib/ai/runs/executor";
import { prepareAiRun } from "@/lib/ai/runs/service";
import { encodeAiStreamEvent } from "@/lib/ai/runs/stream-events";
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
        runLeaseSeconds: configuration.runLeaseSeconds,
        maxConcurrentRuns: configuration.maxConcurrentRuns,
        platformEnabled: configuration.platformEnabled,
        byokEnabled: configuration.byokEnabled,
      },
    });
    const adapter = createAiProviderAdapter("openai-compatible");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of executePreparedAiRun(prepared, { adapter })) {
            controller.enqueue(encoder.encode(encodeAiStreamEvent(event)));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-ai-run-id": prepared.runId,
      },
    });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
