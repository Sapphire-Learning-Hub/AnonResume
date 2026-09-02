import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production configuration proxy", () => {
  it("rewrites document requests to the configuration error page", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    const response = proxy(
      new NextRequest("https://resume.example.com/app", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://resume.example.com/configuration-error",
    );
  });

  it("blocks mutations with a generic 503 response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    const response = proxy(
      new NextRequest("https://resume.example.com/api/resumes/demo", {
        method: "PATCH",
        headers: { accept: "application/json" },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "instance_misconfigured",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows the configuration error page to render without a rewrite loop", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    const response = proxy(
      new NextRequest("https://resume.example.com/configuration-error", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
