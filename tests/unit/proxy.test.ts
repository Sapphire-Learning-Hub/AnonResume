import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubValidProductionEnvironment() {
  const environment = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://anonresume:secret@db.example.com:5432/anonresume",
    BETTER_AUTH_URL: "https://resume.example.com",
    BETTER_AUTH_SECRET: "a".repeat(64),
    CONFIG_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "mailer@example.com",
    SMTP_PASSWORD: "smtp-secret",
    EMAIL_FROM: "AnonResume <mailer@example.com>",
    EMAIL_VERIFICATION_EXPIRES_SECONDS: "3600",
    PDF_EXPORT_MAX_CONCURRENCY: "2",
    PDF_EXPORT_QUEUE_LIMIT: "100",
    PDF_EXPORT_MAX_ACTIVE_PER_USER: "3",
    PDF_EXPORT_MAX_ATTEMPTS: "3",
    PDF_EXPORT_LEASE_MS: "60000",
    PDF_EXPORT_RESULT_TTL_MS: "900000",
    PDF_EXPORT_FORCE_EXPIRY_MS: "86400000",
    PDF_EXPORT_ALLOW_ANONYMOUS: "false",
    RESUME_VERSION_HISTORY_LIMIT: "5",
    ANONRESUME_SUPER_ADMIN_EMAIL: "owner@example.com",
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    ADMIN_SESSION_IDLE_SECONDS: "1800",
    ADMIN_SESSION_MAX_SECONDS: "28800",
    ADMIN_REAUTH_SECONDS: "300",
  };

  for (const [key, value] of Object.entries(environment)) {
    vi.stubEnv(key, value);
  }
}

describe("production configuration proxy", () => {
  it.each([
    ["/app", true],
    ["/api/resumes/example", true],
    ["/help", true],
    ["/_next/static/chunk.js", false],
    ["/_next/image?url=%2Fbrand%2Flogo.png", false],
    ["/marketing/hero.webp", false],
    ["/favicon.ico", false],
    ["/robots.txt", false],
    ["/sitemap.xml", false],
  ])("matches %s: %s", (url, expected) => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }),
    ).toBe(expected);
  });

  it("forwards a fresh canonical request ID and preserves a safe upstream ID", () => {
    const response = proxy(
      new NextRequest("https://resume.example.com/app", {
        headers: {
          "x-anonresume-upstream-request-id": "attacker-controlled",
          "x-request-id": "gateway.request-42",
        },
      }),
    );

    const requestId = response.headers.get(
      "x-middleware-request-x-request-id",
    );
    expect(requestId).not.toBeNull();
    expect(requestId ?? "").toMatch(UUID_PATTERN);
    expect(requestId).not.toBe("gateway.request-42");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(
      response.headers.get(
        "x-middleware-request-x-anonresume-upstream-request-id",
      ),
    ).toBe("gateway.request-42");
  });

  it("does not forward a malicious upstream request ID", () => {
    const response = proxy(
      new NextRequest("https://resume.example.com/app", {
        headers: {
          "x-anonresume-upstream-request-id": "attacker-controlled",
          "x-request-id": "x".repeat(129),
        },
      }),
    );

    expect(
      response.headers.get(
        "x-middleware-request-x-anonresume-upstream-request-id",
      ),
    ).toBeNull();
  });

  it("rejects cross-origin and originless management mutations", async () => {
    const crossOrigin = proxy(
      new NextRequest("https://resume.example.com/api/manage/roles", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );
    const originless = proxy(
      new NextRequest("https://resume.example.com/api/manage/roles", {
        method: "POST",
      }),
    );
    const sameOrigin = proxy(
      new NextRequest("https://resume.example.com/api/manage/roles", {
        method: "POST",
        headers: { origin: "https://resume.example.com" },
      }),
    );

    expect(crossOrigin.status).toBe(403);
    expect(originless.status).toBe(403);
    expect(await crossOrigin.json()).toEqual({ error: "invalid_request_origin" });
    expect(sameOrigin.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects cross-origin and originless setup mutations", async () => {
    const crossOrigin = proxy(
      new NextRequest("https://resume.example.com/api/setup/claim", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );
    const originless = proxy(
      new NextRequest("https://resume.example.com/api/setup/claim", {
        method: "POST",
      }),
    );
    const sameOrigin = proxy(
      new NextRequest("https://resume.example.com/api/setup/claim", {
        method: "POST",
        headers: { origin: "https://resume.example.com" },
      }),
    );

    expect(crossOrigin.status).toBe(403);
    expect(originless.status).toBe(403);
    expect(sameOrigin.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses the configured public origin behind a CDN", async () => {
    stubValidProductionEnvironment();

    const sameOrigin = proxy(
      new NextRequest("http://10.0.0.8:3000/api/manage/activation/start", {
        method: "POST",
        headers: { origin: "https://resume.example.com" },
      }),
    );
    const crossOrigin = proxy(
      new NextRequest("http://10.0.0.8:3000/api/manage/activation/start", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(sameOrigin.headers.get("x-middleware-next")).toBe("1");
    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toEqual({
      error: "invalid_request_origin",
    });
  });

  it("overwrites the internal pathname header before forwarding", () => {
    stubValidProductionEnvironment();
    const response = proxy(
      new NextRequest("https://resume.example.com/app/manage/system", {
        headers: { "x-anonresume-pathname": "/attacker-controlled" },
      }),
    );

    expect(response.headers.get("x-middleware-request-x-anonresume-pathname")).toBe(
      "/app/manage/system",
    );
  });

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
