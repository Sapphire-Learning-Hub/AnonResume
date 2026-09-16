import {
  assertSafeAiEndpoint,
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

async function* readSseData(response: Response) {
  if (!response.body) throw new AiProviderError("invalid_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");

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

async function fetchWithValidatedRedirects({
  fetchImpl,
  resolver,
  request,
  signal,
  maxRedirects,
}: {
  fetchImpl: typeof fetch;
  resolver?: AiDnsResolver;
  request: AiProviderRequest;
  signal: AbortSignal;
  maxRedirects: number;
}) {
  const trustedProxyHostnames = new Set(request.trustedEndpointHostnames ?? []);
  let target = completionUrl(
    await assertSafeAiEndpoint(
      request.endpoint,
      resolver,
      trustedProxyHostnames,
    ),
  );
  const body = JSON.stringify({
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
    ...latencyOptions(request),
    ...(request.proposalTool
      ? {
          tools: [
            {
              type: "function",
              function: request.proposalTool,
            },
          ],
        }
      : {}),
  });

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
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
      });
    } catch (error) {
      if (signal.aborted) throw new AiProviderError("aborted");
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new AiProviderError("timeout");
      }
      throw new AiProviderError("unavailable");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new AiProviderError("invalid_response");
      }
      target = await assertSafeAiEndpoint(
        new URL(location, target),
        resolver,
        trustedProxyHostnames,
      );
      continue;
    }

    return response;
  }

  throw new AiProviderError("invalid_response");
}

export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleAdapterOptions = {},
): AiProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? 2;

  return {
    async *start(request, signal) {
      const startedAt = Date.now();
      const response = await fetchWithValidatedRedirects({
        fetchImpl,
        resolver: options.resolver,
        request,
        signal,
        maxRedirects,
      });
      if (!response.ok) {
        throw new AiProviderError(providerErrorCode(response.status));
      }

      const headerRequestId =
        response.headers.get("x-request-id") ??
        response.headers.get("openai-request-id");
      if (headerRequestId) {
        yield { type: "request_id", requestId: headerRequestId };
      }

      let finishReason: string | null = null;
      let firstChunkLogged = false;
      let firstUnhandledDeltaLogged = false;
      for await (const data of readSseData(response)) {
        if (data === "[DONE]") break;

        let chunk: OpenAiChunk;
        try {
          chunk = JSON.parse(data) as OpenAiChunk;
        } catch {
          throw new AiProviderError("invalid_response");
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
            if (
              (toolCall.function?.name === undefined ||
                toolCall.function.name === "propose_resume_changes") &&
              typeof toolCall.function?.arguments === "string" &&
              toolCall.function.arguments
            ) {
              handledDelta = true;
              yield {
                type: "proposal_delta",
                delta: toolCall.function.arguments,
              };
            }
          }
          if (typeof choice.finish_reason === "string") {
            finishReason = choice.finish_reason;
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

      yield { type: "complete", finishReason };
    },
  };
}
