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

type AiStreamDiagnostics = {
  snapshot: number;
  requestId: number;
  reasoningProgress: number;
  textDelta: number;
  proposalDelta: number;
  usage: number;
  complete: number;
  error: number;
  textCharacters: number;
  proposalCharacters: number;
};

function logAiStream(
  phase: string,
  details: Record<string, string | number | boolean | null>,
) {
  console.info("[AnonResume][AI stream]", phase, details);
}

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
        streamCheckpointMs: configuration.streamCheckpointMs,
        runLeaseSeconds: configuration.runLeaseSeconds,
        trustedEndpointHostnames: configuration.trustedEndpointHostnames,
        maxConcurrentRuns: configuration.maxConcurrentRuns,
        platformEnabled: configuration.platformEnabled,
        byokEnabled: configuration.byokEnabled,
      },
    });
    const preparedAt = Date.now();
    logAiStream("prepared", {
      runId: prepared.runId,
      conversationId: id,
      resumeVersion: body.resumeVersion,
    });
    const adapter = createAiProviderAdapter("openai-compatible");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const diagnostics: AiStreamDiagnostics = {
          snapshot: 0,
          requestId: 0,
          reasoningProgress: 0,
          textDelta: 0,
          proposalDelta: 0,
          usage: 0,
          complete: 0,
          error: 0,
          textCharacters: 0,
          proposalCharacters: 0,
        };
        const firstEvents = new Set<string>();
        logAiStream("opened", {
          runId: prepared.runId,
          elapsedMs: Date.now() - preparedAt,
        });
        try {
          for await (const event of executePreparedAiRun(prepared, {
            adapter,
          })) {
            const eventKey: keyof AiStreamDiagnostics =
              event.type === "request_id"
                ? "requestId"
                : event.type === "reasoning_progress"
                  ? "reasoningProgress"
                  : event.type === "text_delta"
                    ? "textDelta"
                    : event.type === "proposal_delta"
                      ? "proposalDelta"
                      : event.type;
            diagnostics[eventKey] += 1;
            if (event.type === "text_delta") {
              diagnostics.textCharacters += event.delta.length;
            }
            if (event.type === "proposal_delta") {
              diagnostics.proposalCharacters += event.delta.length;
            }
            if (!firstEvents.has(event.type)) {
              firstEvents.add(event.type);
              logAiStream("first_event", {
                runId: prepared.runId,
                type: event.type,
                sequence: event.sequence,
                elapsedMs: Date.now() - preparedAt,
              });
            }
            controller.enqueue(encoder.encode(encodeAiStreamEvent(event)));
          }
          logAiStream("closed", {
            runId: prepared.runId,
            elapsedMs: Date.now() - preparedAt,
            ...diagnostics,
          });
          controller.close();
        } catch (error) {
          logAiStream("failed", {
            runId: prepared.runId,
            elapsedMs: Date.now() - preparedAt,
            errorName: error instanceof Error ? error.name : typeof error,
            ...diagnostics,
          });
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-accel-buffering": "no",
        "x-ai-run-id": prepared.runId,
      },
    });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
