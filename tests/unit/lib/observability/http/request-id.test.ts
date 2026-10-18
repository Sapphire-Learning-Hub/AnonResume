import { describe, expect, it } from "vitest";

import { createRequestIdentity } from "@/lib/observability/http/request-id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("request identity", () => {
  it("creates a canonical UUID when no upstream ID is present", () => {
    const identity = createRequestIdentity(new Headers());

    expect(identity.requestId).toMatch(UUID_PATTERN);
    expect(identity.upstreamRequestId).toBeUndefined();
  });

  it("keeps a bounded upstream ID without trusting it as canonical", () => {
    const headers = new Headers({ "x-request-id": "gateway.request-42" });

    const identity = createRequestIdentity(headers);

    expect(identity.requestId).toMatch(UUID_PATTERN);
    expect(identity.requestId).not.toBe("gateway.request-42");
    expect(identity.upstreamRequestId).toBe("gateway.request-42");
  });

  it.each([
    "contains whitespace",
    "percent%0d%0aencoded",
    "x".repeat(129),
    "",
  ])("discards unsafe upstream request ID %j", (value) => {
    const headers = new Headers();
    if (value) {
      headers.set("x-request-id", value);
    }

    expect(createRequestIdentity(headers).upstreamRequestId).toBeUndefined();
  });
});
