import { z } from "zod";

import {
  aiRunProgressStages,
  type AiClientStreamEvent,
} from "@/lib/ai/runs/stream-events";
import { resumeDocumentSchema } from "@/domain/resume/schema";

const modelSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  providerModelKey: z.string(),
  supportsStreaming: z.boolean(),
  supportsToolCalls: z.boolean(),
  maxOutputTokens: z.number().int().positive(),
  keySource: z.enum(["platform", "user"]),
  providerName: z.string(),
});

const conversationSchema = z.object({
  id: z.string().uuid(),
  resumeId: z.string(),
  title: z.string(),
  contextScope: z.enum(["resume", "section"]),
  sectionId: z.string().nullable(),
  modelId: z.string().uuid(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  sequence: z.number().int().nonnegative(),
  completionState: z.enum(["streaming", "complete", "stopped", "failed"]),
  runId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

const storedProposalSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  baseResumeVersion: z.number().int().positive(),
  proposal: z.unknown(),
  completionState: z.enum(["complete", "incomplete", "invalid"]),
  appliedChangeIds: z.array(z.string()),
  appliedAt: z.string().nullable(),
});

const appliedProposalResultSchema = z.object({
  proposal: z.object({
    id: z.string().uuid(),
    appliedChangeIds: z.array(z.string()),
    appliedAt: z.coerce.date().nullable(),
  }),
  resume: z.object({
    document: resumeDocumentSchema,
    version: z.number().int().positive(),
    updatedAt: z.number().int().nonnegative(),
  }),
});

const conversationDetailsSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
  proposals: z.array(storedProposalSchema),
  activeRun: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      sequence: z.number().int().nonnegative(),
      text: z.string(),
      proposal: z.unknown(),
      progress: z.array(z.enum(aiRunProgressStages)),
    })
    .nullable(),
});

const streamEventSchema = z.discriminatedUnion("type", [
  z.object({
    sequence: z.number().int(),
    type: z.literal("request_id"),
    requestId: z.string(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("reasoning_progress"),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("progress"),
    stage: z.enum(aiRunProgressStages),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("text_delta"),
    delta: z.string(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("proposal_delta"),
    delta: z.string(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("proposal_progress"),
    changes: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        reason: z.string(),
        preview: z.string().nullable(),
      }),
    ),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("proposal_reset"),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("usage"),
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("complete"),
    finishReason: z.string().nullable(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("snapshot"),
    text: z.string(),
    proposalText: z.string(),
  }),
  z.object({
    sequence: z.number().int(),
    type: z.literal("error"),
    code: z.string(),
  }),
]);

export type AiModelOption = z.infer<typeof modelSchema>;
export type AiConversationSummary = z.infer<typeof conversationSchema>;
export type AiConversationMessage = z.infer<typeof messageSchema>;
export type AiStoredProposal = z.infer<typeof storedProposalSchema>;
export type AiConversationDetails = z.infer<typeof conversationDetailsSchema>;

export class AiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly currentVersion?: number,
  ) {
    super(code);
    this.name = "AiClientError";
  }
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = z
      .object({
        error: z.string().optional(),
        currentVersion: z.number().optional(),
      })
      .safeParse(payload);
    throw new AiClientError(
      errorPayload.success && errorPayload.data.error
        ? errorPayload.data.error
        : "ai_request_failed",
      response.status,
      errorPayload.success ? errorPayload.data.currentVersion : undefined,
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AiClientError("ai_invalid_response", response.status);
  }
  return parsed.data;
}

export async function parseAiNdjsonStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AiClientStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function flushLines(final: boolean) {
    const lines = buffer.split("\n");
    buffer = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = streamEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new AiClientError("ai_invalid_stream", 502);
      onEvent(parsed.data as AiClientStreamEvent);
    }
    if (final && buffer.trim()) {
      const parsed = streamEventSchema.safeParse(JSON.parse(buffer));
      if (!parsed.success) throw new AiClientError("ai_invalid_stream", 502);
      onEvent(parsed.data as AiClientStreamEvent);
      buffer = "";
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushLines(false);
  }
  buffer += decoder.decode();
  flushLines(true);
}

export async function fetchAiConversationIndex(resumeId: string) {
  const response = await fetch(
    `/api/ai/conversations?resumeId=${encodeURIComponent(resumeId)}`,
    { cache: "no-store" },
  );
  return parseResponse(
    response,
    z.object({
      enabled: z.boolean(),
      conversations: z.array(conversationSchema),
      models: z.array(modelSchema),
    }),
  );
}

export async function createAiConversation(input: {
  resumeId: string;
  modelId: string;
  title: string;
  contextScope: "resume" | "section";
  sectionId?: string;
}) {
  const response = await fetch("/api/ai/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse(
    response,
    z.object({ conversation: conversationSchema }),
  );
}

export async function fetchAiConversation(conversationId: string) {
  const response = await fetch(`/api/ai/conversations/${conversationId}`, {
    cache: "no-store",
  });
  return parseResponse(response, conversationDetailsSchema);
}

export async function updateAiConversation(
  conversationId: string,
  update: { title?: string; archived?: boolean },
) {
  const response = await fetch(`/api/ai/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  return parseResponse(
    response,
    z.object({ conversation: conversationSchema }),
  );
}

export async function deleteAiConversation(conversationId: string) {
  const response = await fetch(`/api/ai/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!response.ok) await parseResponse(response, z.unknown());
}

export async function sendAiMessage(input: {
  conversationId: string;
  message: string;
  resumeVersion: number;
  signal?: AbortSignal;
  onRun?: (runId: string) => void;
  onEvent: (event: AiClientStreamEvent) => void;
}) {
  const response = await fetch(
    `/api/ai/conversations/${input.conversationId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: input.message,
        resumeVersion: input.resumeVersion,
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) await parseResponse(response, z.unknown());
  if (!response.body) throw new AiClientError("ai_stream_unavailable", 503);
  const runId = response.headers.get("x-ai-run-id");
  if (runId) input.onRun?.(runId);
  await parseAiNdjsonStream(response.body, (event) => {
    if (event.type === "error") {
      throw new AiClientError(event.code, 502);
    }
    input.onEvent(event);
  });
}

const turnActionSchema = z.object({
  stopped: z.literal(true),
  retracted: z.boolean(),
  hadOutput: z.boolean(),
  message: z.string(),
});

type AiTurnAction = z.infer<typeof turnActionSchema>;

export function stopAiRun(runId: string): Promise<{ stopped: true }>;
export function stopAiRun(
  runId: string,
  retract: "if-empty" | "always",
): Promise<AiTurnAction>;
export async function stopAiRun(
  runId: string,
  retract?: "if-empty" | "always",
): Promise<{ stopped: true } | AiTurnAction> {
  const response = await fetch(`/api/ai/runs/${runId}/stop`, {
    method: "POST",
    ...(retract
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ retract }),
        }
      : {}),
  });
  return parseResponse(
    response,
    retract ? turnActionSchema : z.object({ stopped: z.literal(true) }),
  );
}

export async function markAiProposalApplied(input: {
  proposalId: string;
  selectedChangeIds: string[];
}) {
  const response = await fetch(`/api/ai/proposals/${input.proposalId}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      selectedChangeIds: input.selectedChangeIds,
    }),
  });
  return parseResponse(response, appliedProposalResultSchema);
}
