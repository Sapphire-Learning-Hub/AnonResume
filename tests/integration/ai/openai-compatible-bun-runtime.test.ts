import { spawnSync } from "node:child_process";

describe("OpenAI-compatible provider Bun runtime", () => {
  it("uses a real dispatcher and completes a streamed request under Bun", () => {
    const script = String.raw`
      import { Readable } from "node:stream";
      import { Agent } from "undici/index.js";
      import { createOpenAiCompatibleAdapter } from "./src/lib/ai/providers/openai-compatible.ts";

      Agent.prototype.close = () => {
        throw new Error("provider dispatcher must not wait for graceful close");
      };
      const destroy = Agent.prototype.destroy;
      let destroyed = 0;
      Agent.prototype.destroy = function (...args) {
        destroyed += 1;
        return destroy.apply(this, args);
      };

      const adapter = createOpenAiCompatibleAdapter({
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
        requestImpl: async () => ({
          statusCode: 200,
          headers: {},
          body: Readable.from([
            Buffer.from(
              'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
            ),
            Buffer.from('data: [DONE]\n\n'),
          ]),
        }),
      });
      const events = [];
      for await (const event of adapter.start({
        endpoint: new URL("https://models.example.com/v1"),
        apiKey: "sk-test",
        model: "example-model",
        messages: [{ role: "user", content: "hello" }],
        maxOutputTokens: 32,
      }, new AbortController().signal)) {
        events.push(event);
      }
      console.log(JSON.stringify({ destroyed, events }));
    `;
    const result = spawnSync("bun", ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout.trim().split("\n").at(-1);
    const parsed = JSON.parse(output ?? "null") as {
      destroyed: number;
      events: unknown[];
    };
    expect(parsed.destroyed).toBeGreaterThan(0);
    expect(parsed.events).toEqual([
      { type: "text_delta", delta: "ok" },
      { type: "complete", finishReason: "stop" },
    ]);
  });

  it("interrupts a response body that remains open after receiving headers", () => {
    const script = String.raw`
      import { Readable } from "node:stream";
      import { createOpenAiCompatibleAdapter } from "./src/lib/ai/providers/openai-compatible.ts";

      let sent = false;
      const adapter = createOpenAiCompatibleAdapter({
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
        requestTimeoutMs: 50,
        requestImpl: async () => ({
          statusCode: 200,
          headers: {},
          body: new Readable({
            read() {
              if (sent) return;
              sent = true;
              this.push(
                'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
              );
            },
          }),
        }),
      });
      try {
        for await (const event of adapter.start({
          endpoint: new URL("https://models.example.com/v1"),
          apiKey: "sk-test",
          model: "example-model",
          messages: [{ role: "user", content: "hello" }],
          maxOutputTokens: 32,
        }, new AbortController().signal)) {
          void event;
        }
      } catch (error) {
        console.log(JSON.stringify({ code: error.code }));
      }
    `;
    const result = spawnSync("bun", ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 2_000,
    });

    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout.trim().split("\n").at(-1);
    expect(JSON.parse(output ?? "null")).toEqual({ code: "timeout" });
  });
});
