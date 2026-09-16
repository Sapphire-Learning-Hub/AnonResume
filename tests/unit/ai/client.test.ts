import { parseAiNdjsonStream } from "@/lib/ai/client";

describe("AI client stream parser", () => {
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
});
