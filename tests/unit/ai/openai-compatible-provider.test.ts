import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";
import type { AiProviderRequest } from "@/lib/ai/providers/types";

function streamResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    init,
  );
}

function providerRequest(
  overrides: Partial<AiProviderRequest> = {},
): AiProviderRequest {
  return {
    endpoint: new URL("https://models.example.com/v1/"),
    apiKey: "sk-test",
    model: "example-model",
    messages: [
      { role: "system", content: "Follow the contract." },
      { role: "user", content: "Improve this sentence." },
    ],
    maxOutputTokens: 512,
    ...overrides,
  };
}

const publicResolver = async () =>
  [{ address: "93.184.216.34", family: 4 }] as const;

describe("OpenAI-compatible provider adapter", () => {
  it("turns private reasoning chunks into content-free progress events", async () => {
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async () =>
        streamResponse([
          'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"internal step one"}}]}\n\n',
          'data: {"choices":[{"delta":{"reasoning_content":"internal step two"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
    });
    const events = [];

    for await (const event of adapter.start(
      providerRequest({ latencyPreference: "fast" }),
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_progress" },
      { type: "reasoning_progress" },
      { type: "complete", finishReason: null },
    ]);
    expect(JSON.stringify(events)).not.toContain("internal step");
  });

  it("maps fragmented text, proposal tool arguments, and usage", async () => {
    const bodies: string[] = [];
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (_input, init) => {
        bodies.push(String(init?.body));
        return streamResponse(
          [
            'data: {"id":"req_123","choices":[{"delta":{"content":"更',
            '清晰"}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"propose_resume_changes","arguments":"{\\"changes\\":["}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"id\\":\\"c1\\"}]}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"prompt_tokens_details":{"cached_tokens":5},"completion_tokens":9}}\n\n',
            "data: [DONE]\n\n",
          ],
          { status: 200, headers: { "x-request-id": "header-request" } },
        );
      },
    });

    const events = [];
    for await (const event of adapter.start(
      providerRequest({
        proposalTool: {
          name: "propose_resume_changes",
          description: "Return validated resume changes.",
          parameters: { type: "object" },
        },
      }),
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "request_id", requestId: "header-request" },
      { type: "text_delta", delta: "更清晰" },
      { type: "proposal_delta", delta: '{"changes":[' },
      { type: "proposal_delta", delta: '{"id":"c1"}]}' },
      {
        type: "usage",
        inputTokens: 20,
        cachedInputTokens: 5,
        outputTokens: 9,
      },
      { type: "complete", finishReason: "tool_calls" },
    ]);
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      model: "example-model",
      stream: true,
      tools: [{ function: { name: "propose_resume_changes" } }],
    });
  });

  it("does not send proposal tools to text-only models", async () => {
    let body: Record<string, unknown> | undefined;
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return streamResponse(["data: [DONE]\n\n"], { status: 200 });
      },
    });

    for await (const event of adapter.start(
      providerRequest(),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("thinking");
  });

  it("disables deep thinking for fast FireArk requests", async () => {
    let body: Record<string, unknown> | undefined;
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return streamResponse(["data: [DONE]\n\n"], { status: 200 });
      },
    });

    for await (const event of adapter.start(
      providerRequest({
        endpoint: new URL("https://ark.cn-beijing.volces.com/api/v3"),
        latencyPreference: "fast",
      }),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(body).toMatchObject({
      thinking: { type: "disabled" },
    });
  });

  it.each([
    [401, "authentication"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ] as const)("normalizes provider status %s", async (status, code) => {
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async () =>
        new Response("provider details must not escape", { status }),
    });

    const consume = async () => {
      for await (const event of adapter.start(
        providerRequest(),
        new AbortController().signal,
      )) {
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({ code });
    await expect(consume()).rejects.not.toThrow("provider details");
  });
});
