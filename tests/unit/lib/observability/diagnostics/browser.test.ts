import { sanitizeClientError } from "@/lib/observability/browser/sanitize";
import {
  attachErrorDiagnostic,
  getErrorDiagnostic,
  readResponseDiagnostic,
} from "@/lib/observability/diagnostics/schema";

it("only captures own code positions, never messages, foreign scripts or arbitrary rejection values", () => {
  const error = new Error("private form value");
  error.stack =
    "Error: private form value\n at unsafeName (https://app.test/_next/static/chunks/a.js:2:10)\n at thirdParty (https://other.test/tracker.js:1:1)";
  const safe = sanitizeClientError(
    error,
    "script",
    "https://app.test",
    "build-1",
  );
  expect(safe?.frames).toEqual([
    { asset: "/_next/static/chunks/a.js", line: 2, column: 10 },
  ]);
  expect(JSON.stringify(safe)).not.toMatch(/private|unsafeName|other.test/);
  expect(
    sanitizeClientError(
      "private rejection",
      "promise",
      "https://app.test",
      "build-1",
    ),
  ).toBeUndefined();
  expect(
    sanitizeClientError(
      new Error("extension failed"),
      "script",
      "https://app.test",
      "build-1",
    ),
  ).toBeUndefined();
});
it("retains validated diagnostics without changing typed errors or trusting malformed headers", () => {
  const error = new TypeError("known_code");
  const id = crypto.randomUUID();
  expect(attachErrorDiagnostic(error, id)).toBe(error);
  expect(getErrorDiagnostic(error)).toBe(id);
  expect(
    readResponseDiagnostic(
      new Response(null, { headers: { "x-diagnostic-id": "password" } }),
    ),
  ).toBeUndefined();
  expect(
    readResponseDiagnostic(
      new Response(null, { headers: { "x-diagnostic-id": id } }),
    ),
  ).toBe(id);
});
