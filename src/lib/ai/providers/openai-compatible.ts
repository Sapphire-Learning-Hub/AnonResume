import {
  Agent,
  buildConnector,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";

import {
  resolveSafeAiEndpoint,
  type AiResolvedAddress,
  type AiDnsResolver,
} from "@/lib/ai/security/endpoint-policy";

import {
  AiProviderError,
  type AiProviderAdapter,
  type AiProviderErrorCode,
  type AiProviderRequest,
} from "./types";

interface OpenAiChunk {
  id?: unknown;
  choices?: Array<{
    delta?: {
      content?: unknown;
      reasoning_content?: unknown;
      tool_calls?: Array<{
        id?: unknown;
        index?: unknown;
        function?: { name?: unknown; arguments?: unknown };
      }>;
    };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
    completion_tokens?: unknown;
  };
}

interface OpenAiCompatibleAdapterOptions {
  fetchImpl?: typeof fetch;
  resolver?: AiDnsResolver;
  maxRedirects?: number;
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
}

const MAX_DIAGNOSTIC_EXCERPT_LENGTH = 4_096;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1_024 * 1_024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_SSE_EVENT_BYTES = 1 * 1_024 * 1_024;

function diagnosticExcerpt(value: string) {
  return value.slice(0, MAX_DIAGNOSTIC_EXCERPT_LENGTH);
}

function providerErrorCode(status: number): AiProviderErrorCode {
  if (status === 401 || status === 403) return "authentication";
  if (status === 408) return "timeout";
  if (status === 413 || status === 422) return "context_limit";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function completionUrl(endpoint: URL) {
  const url = new URL(endpoint);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  url.search = "";
  url.hash = "";
  return url;
}

function latencyOptions(request: AiProviderRequest) {
  if (
    request.latencyPreference === "fast" &&
    request.endpoint.hostname.toLowerCase() === "ark.cn-beijing.volces.com"
  ) {
    return { thinking: { type: "disabled" } };
  }
  return {};
}

function serializeMessages(request: AiProviderRequest) {
  return request.messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }
    if (message.toolCalls) {
      return {
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      };
    }
    return message;
  });
}

async function* readSseData(response: Response, maxResponseBytes: number) {
  if (!response.body) throw new AiProviderError("invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    receivedBytes += value?.byteLength ?? 0;
    if (receivedBytes > maxResponseBytes) {
      throw new AiProviderError("invalid_response");
    }
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    if (buffer.length > MAX_SSE_EVENT_BYTES && !buffer.includes("\n\n")) {
      throw new AiProviderError("invalid_response");
    }

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const data = buffer
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) yield data;
  }
}

function createPinnedDispatcher({
  hostname,
  addresses,
  maxResponseBytes,
  requestTimeoutMs,
}: {
  hostname: string;
  addresses: readonly AiResolvedAddress[];
  maxResponseBytes: number;
  requestTimeoutMs: number;
}) {
  const connector = buildConnector({ timeout: requestTimeoutMs });
  let nextAddress = 0;

  return new Agent({
    bodyTimeout: requestTimeoutMs,
    headersTimeout: requestTimeoutMs,
    maxResponseSize: maxResponseBytes,
    connect(options, callback) {
      const address = addresses[nextAddress % addresses.length]!;
      nextAddress += 1;
      connector(
        {
          ...options,
          host: address.address,
          hostname: address.address,
          servername: hostname,
        },
        callback,
      );
    },
  });
}

async function fetchWithValidatedRedirects({
  fetchImpl,
  resolver,
  request,
  signal,
  maxRedirects,
  maxResponseBytes,
  requestTimeoutMs,
}: {
  fetchImpl: typeof fetch;
  resolver?: AiDnsResolver;
  request: AiProviderRequest;
  signal: AbortSignal;
  maxRedirects: number;
  maxResponseBytes: number;
  requestTimeoutMs: number;
}) {
  const trustedProxyHostnames = new Set(request.trustedEndpointHostnames ?? []);
  const tools = request.tools ?? (request.proposalTool ? [request.proposalTool] : []);
  let target = completionUrl(request.endpoint);
  const body = JSON.stringify({
    model: request.model,
    messages: serializeMessages(request),
    max_tokens: request.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
    ...latencyOptions(request),
    ...(tools.length > 0
      ? {
          parallel_tool_calls: false,
          tool_choice: request.toolChoice ?? "auto",
          tools: tools.map((tool) => ({ type: "function", function: tool })),
        }
      : {}),
  });

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const resolved = await resolveSafeAiEndpoint(
      target,
      resolver,
      trustedProxyHostnames,
    );
    target = resolved.endpoint;
    const dispatcher = createPinnedDispatcher({
      hostname: target.hostname,
      addresses: resolved.addresses,
      maxResponseBytes,
      requestTimeoutMs,
    });
    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          authorization: `Bearer ${request.apiKey}`,
          "content-type": "application/json",
        },
        body,
        redirect: "manual",
        signal,
        dispatcher,
      } as RequestInit);
    } catch (error) {
      await dispatcher.close().catch(() => undefined);
      if (signal.aborted) throw new AiProviderError("aborted");
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new AiProviderError("timeout");
      }
      throw new AiProviderError("unavailable");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        await dispatcher.close().catch(() => undefined);
        throw new AiProviderError("invalid_response");
      }
      await response.body?.cancel().catch(() => undefined);
      await dispatcher.close().catch(() => undefined);
      target = new URL(location, target);
      continue;
    }

    return { dispatcher, response };
  }

  throw new AiProviderError("invalid_response");
}

export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleAdapterOptions = {},
): AiProviderAdapter {
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as typeof fetch);
  const maxRedirects = options.maxRedirects ?? 2;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  return {
    async *start(request, signal) {
      const startedAt = Date.now();
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const requestSignal = AbortSignal.any([signal, timeoutSignal]);
      let dispatcher: Dispatcher | undefined;
      try {
        const fetched = await fetchWithValidatedRedirects({
          fetchImpl,
          resolver: options.resolver,
          request,
          signal: requestSignal,
          maxRedirects,
          maxResponseBytes,
          requestTimeoutMs,
        });
        const response = fetched.response;
        dispatcher = fetched.dispatcher;
        if (!response.ok) {
          throw new AiProviderError(providerErrorCode(response.status), {
            httpStatus: response.status,
            responseExcerpt: diagnosticExcerpt(await response.text()),
          });
        }

        const headerRequestId =
          response.headers.get("x-request-id") ??
          response.headers.get("openai-request-id");
        if (headerRequestId) {
          yield { type: "request_id", requestId: headerRequestId };
        }

      let finishReason: string | null = null;
      let proposalToolCallIndex: number | undefined;
      let proposalToolCallId: string | undefined;
      let toolCallName: string | undefined;
      let toolCallArguments = "";
      let toolCallFinishEventExcerpt: string | undefined;
      let firstChunkLogged = false;
      let firstUnhandledDeltaLogged = false;
      for await (const data of readSseData(response, maxResponseBytes)) {
        if (data === "[DONE]") break;

        let chunk: OpenAiChunk;
        try {
          chunk = JSON.parse(data) as OpenAiChunk;
        } catch {
          throw new AiProviderError("invalid_response", {
            streamEventExcerpt: diagnosticExcerpt(data),
          });
        }

        const deltaKeys = [
          ...new Set(
            (chunk.choices ?? []).flatMap((choice) =>
              choice.delta ? Object.keys(choice.delta) : [],
            ),
          ),
        ];
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.info("[AnonResume][AI provider]", "first_chunk", {
            runId: request.diagnosticRunId ?? null,
            elapsedMs: Date.now() - startedAt,
            choiceCount: chunk.choices?.length ?? 0,
            deltaKeys,
            hasUsage: Boolean(chunk.usage),
          });
        }

        if (!headerRequestId && typeof chunk.id === "string") {
          yield { type: "request_id", requestId: chunk.id };
        }

        let handledDelta = false;
        for (const choice of chunk.choices ?? []) {
          if (
            typeof choice.delta?.reasoning_content === "string" &&
            choice.delta.reasoning_content
          ) {
            handledDelta = true;
            yield { type: "reasoning_progress" };
          }
          if (
            typeof choice.delta?.content === "string" &&
            choice.delta.content
          ) {
            handledDelta = true;
            yield { type: "text_delta", delta: choice.delta.content };
          }
          for (const toolCall of choice.delta?.tool_calls ?? []) {
            const toolCallIndex = Number.isSafeInteger(toolCall.index)
              ? Number(toolCall.index)
              : 0;
            const toolCallId =
              typeof toolCall.id === "string" ? toolCall.id : undefined;
            if (
              (proposalToolCallIndex !== undefined &&
                proposalToolCallIndex !== toolCallIndex) ||
              (proposalToolCallId && toolCallId && proposalToolCallId !== toolCallId)
            ) {
              throw new AiProviderError("invalid_response");
            }
            proposalToolCallIndex ??= toolCallIndex;
            proposalToolCallId ??= toolCallId;
            if (typeof toolCall.function?.name === "string") {
              toolCallName = toolCall.function.name;
            }
            if (
              toolCallName === "propose_resume_changes" &&
              typeof toolCall.function?.arguments === "string" &&
              toolCall.function.arguments
            ) {
              handledDelta = true;
              yield {
                type: "proposal_delta",
                delta: toolCall.function.arguments,
              };
            } else if (
              toolCallName &&
              typeof toolCall.function?.arguments === "string" &&
              toolCall.function.arguments
            ) {
              handledDelta = true;
              toolCallArguments += toolCall.function.arguments;
            }
          }
          if (typeof choice.finish_reason === "string") {
            finishReason = choice.finish_reason;
            if (choice.finish_reason === "tool_calls") {
              toolCallFinishEventExcerpt = diagnosticExcerpt(data);
            }
          }
        }

        if (
          !handledDelta &&
          deltaKeys.length > 0 &&
          !firstUnhandledDeltaLogged
        ) {
          firstUnhandledDeltaLogged = true;
          console.info("[AnonResume][AI provider]", "unhandled_delta", {
            runId: request.diagnosticRunId ?? null,
            elapsedMs: Date.now() - startedAt,
            deltaKeys,
            reasoningCharacters: (chunk.choices ?? []).reduce(
              (total, choice) =>
                total +
                (typeof choice.delta?.reasoning_content === "string"
                  ? choice.delta.reasoning_content.length
                  : 0),
              0,
            ),
          });
        }

        if (chunk.usage) {
          yield {
            type: "usage",
            inputTokens: numberValue(chunk.usage.prompt_tokens),
            cachedInputTokens: numberValue(
              chunk.usage.prompt_tokens_details?.cached_tokens,
            ),
            outputTokens: numberValue(chunk.usage.completion_tokens),
          };
        }
      }

      if (finishReason === "tool_calls" && !toolCallName) {
        throw new AiProviderError("invalid_response", {
          protocolViolation: "missing_tool_payload",
          streamEventExcerpt: toolCallFinishEventExcerpt,
        });
      }
      if (toolCallName && toolCallName !== "propose_resume_changes") {
        yield {
          type: "tool_call",
          callId: proposalToolCallId ?? `tool-${proposalToolCallIndex ?? 0}`,
          name: toolCallName,
          arguments: toolCallArguments,
        };
      }

        yield { type: "complete", finishReason };
      } catch (error) {
        if (error instanceof AiProviderError) {
          if (error.code === "aborted" && timeoutSignal.aborted && !signal.aborted) {
            throw new AiProviderError("timeout");
          }
          throw error;
        }
        if (requestSignal.aborted) {
          throw new AiProviderError(
            timeoutSignal.aborted && !signal.aborted ? "timeout" : "aborted",
          );
        }
        throw error;
      } finally {
        await dispatcher?.close().catch(() => undefined);
      }
    },
  };
}
