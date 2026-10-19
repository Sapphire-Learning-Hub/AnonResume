import { handleClientErrors } from "@/lib/observability/browser/receiver";
import { DiagnosticIntakeBudget } from "@/lib/observability/browser/limiter";
import { setClientErrorPolicy } from "@/lib/observability/browser/policy";

const event = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  kind: "render",
  buildId: "test",
  errorType: "Error",
  frames: [{ asset: "/_next/static/chunks/app.js", line: 1, column: 2 }],
};
const request = (value: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/diagnostics/client-errors", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
it("enforces independent intake limits and idempotency without trusting identities or content", async () => {
  setClientErrorPolicy(true);
  const budget = new DiagnosticIntakeBudget();
  const body = { version: 1, events: [event] };
  const first = await handleClientErrors(request(body), budget);
  expect(first.status).toBe(202);
  const firstBody = await first.json();
  expect(
    await (await handleClientErrors(request(body), budget)).json(),
  ).toEqual(firstBody);
  expect(
    (
      await handleClientErrors(
        request({ version: 1, events: [{ ...event, errorType: "TypeError" }] }),
        budget,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await handleClientErrors(
        request({ ...body, userId: "forged", secret: "private" }),
        budget,
      )
    ).status,
  ).toBe(400);
  expect(
    (await handleClientErrors(request(body, "http://attacker.test"), budget))
      .status,
  ).toBe(403);
  expect(
    (
      await handleClientErrors(
        request({ ...body, extra: "x".repeat(17000) }),
        budget,
      )
    ).status,
  ).toBe(413);
  setClientErrorPolicy(false);
  expect((await handleClientErrors(request(body), budget)).status).toBe(204);
});
it("bounds requests and events independently, with a finite burst", () => {
  const budget = new DiagnosticIntakeBudget();
  expect(budget.admit(30, 1000)).toBe(true);
  expect(budget.admit(1, 1000)).toBe(false);
  expect(budget.admit(1, 1500)).toBe(true);
  for (let i = 0; i < 120; i++) budget.admit(0, 2000);
  expect(budget.admit(0, 2000)).toBe(false);
  expect(budget.admit(1, 62000)).toBe(true);
});

it("cancels an unfinished body at the intake deadline instead of waiting indefinitely", async () => {
  vi.useFakeTimers();
  try {
    setClientErrorPolicy(true);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body,
      duplex: "half",
    };
    const pending = handleClientErrors(
      new Request("http://localhost/api/diagnostics/client-errors", init),
      new DiagnosticIntakeBudget(),
    );
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending).status).toBe(408);
    expect(cancelled).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
