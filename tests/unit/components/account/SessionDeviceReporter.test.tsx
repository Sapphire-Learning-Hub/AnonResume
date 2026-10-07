import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionDeviceReporter } from "@/components/account/SessionDeviceReporter";

describe("SessionDeviceReporter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "userAgentData");
  });

  it("reports high-entropy platform details without browser version data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 204,
    }));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        platform: "macOS",
        getHighEntropyValues: vi.fn().mockResolvedValue({
          model: "",
          platformVersion: "26.0.1",
        }),
      },
    });

    render(<SessionDeviceReporter />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/sessions",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "macOS",
          platformVersion: "26.0.1",
          model: "",
        }),
        keepalive: true,
      },
    ));
  });

  it("lets the server read HTTP client hints when the JavaScript API is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 204,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SessionDeviceReporter />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/sessions",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
        keepalive: true,
      },
    ));
  });
});
