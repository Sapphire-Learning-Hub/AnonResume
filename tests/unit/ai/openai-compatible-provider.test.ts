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
  it("aborts a provider request that exceeds the local deadline", async () => {
    vi.useFakeTimers();
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      requestTimeoutMs: 50,
      fetchImpl: async (_input, init) => {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
        throw new Error("unreachable");
      },
    });

    const consume = async () => {
      for await (const event of adapter.start(
        providerRequest(),
        new AbortController().signal,
      )) {
        void event;
      }
    };
    const result = consume();
    await vi.advanceTimersByTimeAsync(51);

    await expect(result).rejects.toMatchObject({ code: "timeout" });
    vi.useRealTimers();
  });

  it("rejects provider streams that exceed the response byte limit", async () => {
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      maxResponseBytes: 32,
      fetchImpl: async () =>
        streamResponse([
          `data: ${JSON.stringify({ choices: [{ delta: { content: "x".repeat(64) } }] })}\n\n`,
        ]),
    });

    const consume = async () => {
      for await (const event of adapter.start(
        providerRequest(),
        new AbortController().signal,
      )) {
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({ code: "invalid_response" });
  });

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
      parallel_tool_calls: false,
      stream: true,
      tool_choice: "auto",
      tools: [{ function: { name: "propose_resume_changes" } }],
    });
  });

  it("assembles a generic serial tool call for the agent loop", async () => {
    let body: Record<string, unknown> | undefined;
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return streamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"stage_section_changes","arguments":"{\\"operations\\":["}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"type\\":\\"create\\"}]}"}}]},"finish_reason":"tool_calls"}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      },
    });
    const events = [];

    for await (const event of adapter.start(
      providerRequest({
        tools: [
          {
            name: "stage_section_changes",
            description: "Stage section changes.",
            parameters: { type: "object" },
          },
        ],
      }),
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "tool_call",
      callId: "call-1",
      name: "stage_section_changes",
      arguments: '{"operations":[{"type":"create"}]}',
    });
    expect(body).toMatchObject({
      parallel_tool_calls: false,
      tools: [{ function: { name: "stage_section_changes" } }],
    });
  });

  it("sends tool results back with OpenAI-compatible tool message roles", async () => {
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
        messages: [
          { role: "user", content: "Create a section." },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                name: "stage_section_changes",
                arguments: '{"operations":[]}',
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-1",
            content: '{"ok":true}',
          },
        ],
      }),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(body).toMatchObject({
      messages: [
        { role: "user", content: "Create a section." },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "stage_section_changes",
                arguments: '{"operations":[]}',
              },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: '{"ok":true}' },
      ],
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

  it("rejects multiple proposal tool calls instead of joining their arguments", async () => {
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async () =>
        streamResponse([
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"propose_resume_changes","arguments":"{\\"changes\\":[]}"}},{"index":1,"id":"call-2","function":{"name":"propose_resume_changes","arguments":"{\\"changes\\":[]}"}}]}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
    });

    const consume = async () => {
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
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects a tool-call finish without a tool payload", async () => {
    const finishChunk =
      '{"choices":[{"delta":{"content":"","role":"assistant"},"finish_reason":"tool_calls"}]}';
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async () =>
        streamResponse([
          `data: ${finishChunk}\n\n`,
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":0}}\n\n',
          "data: [DONE]\n\n",
        ]),
    });

    const consume = async () => {
      for await (const event of adapter.start(
        providerRequest({
          tools: [
            {
              name: "stage_section_changes",
              description: "Stage section changes.",
              parameters: { type: "object" },
            },
          ],
          toolChoice: "required",
        }),
        new AbortController().signal,
      )) {
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: "invalid_response",
      diagnostics: { streamEventExcerpt: finishChunk },
    });
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

  it("can require the proposal tool for a repair round", async () => {
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
        toolChoice: "required",
        proposalTool: {
          name: "propose_resume_changes",
          description: "Return validated resume changes.",
          parameters: { type: "object" },
        },
      }),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(body).toMatchObject({ tool_choice: "required" });
  });

  it.each([
    "https://attacker.example/collect",
    "//attacker.example/collect",
    "https://models.example.com:444/collect",
  ])(
    "rejects cross-origin redirect %s without forwarding credentials or content",
    async (location) => {
      const requests: Array<{
        url: string;
        authorization: string | null;
        body: string;
      }> = [];
      const adapter = createOpenAiCompatibleAdapter({
        resolver: publicResolver,
        fetchImpl: async (input, init) => {
          requests.push({
            url: String(input),
            authorization: new Headers(init?.headers).get("authorization"),
            body: String(init?.body),
          });
          return new Response(null, {
            status: 307,
            headers: { location },
          });
        },
      });

      const consume = async () => {
        for await (const event of adapter.start(
          providerRequest(),
          new AbortController().signal,
        )) {
          void event;
        }
      };

      await expect(consume()).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        url: "https://models.example.com/v1/chat/completions",
        authorization: "Bearer sk-test",
      });
      expect(requests[0]?.body).toContain("Improve this sentence.");
    },
  );

  it("follows same-origin redirects while retaining the provider request", async () => {
    const requests: Array<{
      url: string;
      authorization: string | null;
      body: string;
    }> = [];
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input),
          authorization: new Headers(init?.headers).get("authorization"),
          body: String(init?.body),
        });
        if (requests.length === 1) {
          return new Response(null, {
            status: 307,
            headers: { location: "/api/v1/chat/completions" },
          });
        }
        return streamResponse(["data: [DONE]\n\n"], { status: 200 });
      },
    });

    for await (const event of adapter.start(
      providerRequest(),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      url: "https://models.example.com/api/v1/chat/completions",
      authorization: "Bearer sk-test",
      body: requests[0]?.body,
    });
  });

  it("follows a validated cross-origin redirect only when explicitly allowed", async () => {
    const resolvedHostnames: string[] = [];
    const requests: string[] = [];
    const adapter = createOpenAiCompatibleAdapter({
      resolver: async (hostname) => {
        resolvedHostnames.push(hostname);
        return publicResolver();
      },
      fetchImpl: async (input) => {
        requests.push(String(input));
        if (requests.length === 1) {
          return new Response(null, {
            status: 307,
            headers: { location: "https://trusted-cdn.example/v1/stream" },
          });
        }
        return streamResponse(["data: [DONE]\n\n"], { status: 200 });
      },
    });

    for await (const event of adapter.start(
      providerRequest({ allowCrossOriginRedirects: true }),
      new AbortController().signal,
    )) {
      void event;
    }

    expect(requests).toEqual([
      "https://models.example.com/v1/chat/completions",
      "https://trusted-cdn.example/v1/stream",
    ]);
    expect(resolvedHostnames).toEqual([
      "models.example.com",
      "trusted-cdn.example",
    ]);
  });

  it("keeps private-network redirects blocked when cross-origin redirects are allowed", async () => {
    const requests: string[] = [];
    const adapter = createOpenAiCompatibleAdapter({
      resolver: publicResolver,
      fetchImpl: async (input) => {
        requests.push(String(input));
        return new Response(null, {
          status: 307,
          headers: { location: "https://127.0.0.1/internal" },
        });
      },
    });

    const consume = async () => {
      for await (const event of adapter.start(
        providerRequest({ allowCrossOriginRedirects: true }),
        new AbortController().signal,
      )) {
        void event;
      }
    };

    await expect(consume()).rejects.toThrow("unsafe_ai_endpoint");
    expect(requests).toEqual([
      "https://models.example.com/v1/chat/completions",
    ]);
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

    await expect(consume()).rejects.toMatchObject({
      code,
      diagnostics: {
        httpStatus: status,
        responseExcerpt: "provider details must not escape",
      },
    });
    await expect(consume()).rejects.not.toThrow("provider details");
  });
});
