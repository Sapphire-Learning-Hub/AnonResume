import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createApplicationUrl,
  requireSameOrigin,
} from "@/lib/request-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("request origin protection", () => {
  it("uses the configured public origin when a CDN forwards to an internal origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://resume.example.com");
    const request = new Request("http://10.0.0.8:3000/app/create-resume", {
      headers: { origin: "https://resume.example.com" },
    });

    expect(requireSameOrigin(request)).toBeNull();
    expect(createApplicationUrl("/app", request).href).toBe(
      "https://resume.example.com/app",
    );
  });

  it("creates a fresh forbidden response for every rejected request", async () => {
    const first = requireSameOrigin(
      new Request("http://localhost/app", {
        headers: { origin: "https://evil.example" },
      }),
    );
    const second = requireSameOrigin(
      new Request("http://localhost/app", {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(first).not.toBe(second);
    await expect(first?.json()).resolves.toEqual({ error: "forbidden" });
    await expect(second?.json()).resolves.toEqual({ error: "forbidden" });
  });
});
