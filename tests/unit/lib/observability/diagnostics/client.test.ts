import {
  configureBrowserDiagnostics,
  reportClientError,
} from "@/lib/observability/browser/client";
import { getDiagnosticDelivery } from "@/lib/observability/browser/state";

function error(index: number) {
  const value = new Error("never send this");
  value.stack = `Error: never send this\n at privateName (${window.location.origin}/_next/static/chunks/test${index}.js:1:2)`;
  return value;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  configureBrowserDiagnostics(true);
});
it("retries network failures once, preserves unconfirmed delivery and halts after a server rate limit", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetcher);
  const id = reportClientError(error(1), "script")!;
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(getDiagnosticDelivery(id)).toEqual({ status: "unconfirmed" });
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain("never send this");
  fetcher.mockResolvedValue(new Response(null, { status: 429 }));
  reportClientError(error(2), "script");
  await vi.advanceTimersByTimeAsync(10);
  reportClientError(error(3), "script");
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  configureBrowserDiagnostics(false);
  expect(reportClientError(error(4), "script")).toBeUndefined();
});
