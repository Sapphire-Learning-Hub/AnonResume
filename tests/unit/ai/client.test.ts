import { parseAiNdjsonStream, sendAiMessage } from "@/lib/ai/client";

describe("AI client stream parser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses fragmented NDJSON events without dropping the final frame", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      '{"sequence":1,"type":"text_',
      'delta","delta":"你好"}\n{"sequence":2,"type":"complete",',
      '"finishReason":"stop"}',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const events: unknown[] = [];

    await parseAiNdjsonStream(stream, (event) => events.push(event));

    expect(events).toEqual([
      { sequence: 1, type: "text_delta", delta: "你好" },
      { sequence: 2, type: "complete", finishReason: "stop" },
    ]);
  });

  it("rejects the send operation when the stream reports a provider failure", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '{"sequence":1,"type":"error","code":"provider_failed"}\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "x-ai-run-id": "62622b5d-ec93-43fb-925d-6b631703799b" },
        }),
      ),
    );

    await expect(
      sendAiMessage({
        conversationId: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
        message: "帮我优化工作经历",
        resumeVersion: 1,
        onEvent: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "provider_failed" });
  });
});
