import type { NextRequest } from "next/server";
import { DIAGNOSTIC_HEADER } from "@/lib/observability/diagnostics/schema";
import { NextResponse } from "next/server";

import { getExpectedRequestOrigin } from "@/lib/http/request-origin";
import { validateBootstrapConfiguration } from "@/lib/config/bootstrap";
import {
  createRequestIdentity,
  REQUEST_ID_HEADER,
  UPSTREAM_REQUEST_ID_HEADER,
} from "@/lib/observability/http";

const configurationErrorPath = "/configuration-error";

export function proxy(request: NextRequest) {
  const identity = createRequestIdentity(request.headers);
  const configuration = validateBootstrapConfiguration();
  const correlate = <T extends NextResponse>(response: T) => {
    response.headers.set(REQUEST_ID_HEADER, identity.requestId);
    response.headers.set(DIAGNOSTIC_HEADER, identity.requestId);
    return response;
  };
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    for (const name of ["traceparent", "tracestate", "baggage", DIAGNOSTIC_HEADER]) requestHeaders.delete(name);
    requestHeaders.set("x-anonresume-pathname", request.nextUrl.pathname);
    requestHeaders.set(REQUEST_ID_HEADER, identity.requestId);
    requestHeaders.delete(UPSTREAM_REQUEST_ID_HEADER);
    if (identity.upstreamRequestId) {
      requestHeaders.set(
        UPSTREAM_REQUEST_ID_HEADER,
        identity.upstreamRequestId,
      );
    }
    return correlate(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  };

  if (configuration.valid) {
    if (
      (request.nextUrl.pathname.startsWith("/api/manage/") ||
        request.nextUrl.pathname.startsWith("/api/setup/")) &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== getExpectedRequestOrigin(request)) {
        return correlate(
          NextResponse.json(
            { error: "invalid_request_origin" },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          ),
        );
      }
    }
    return next();
  }

  if (
    request.nextUrl.pathname === configurationErrorPath &&
    ["GET", "HEAD"].includes(request.method)
  ) {
    return next();
  }

  const acceptsHtml = request.headers.get("accept")?.includes("text/html");

  if (["GET", "HEAD"].includes(request.method) && acceptsHtml) {
    const response = NextResponse.rewrite(
      new URL(configurationErrorPath, request.url),
    );
    response.headers.set("Cache-Control", "no-store");
    return correlate(response);
  }

  return correlate(
    NextResponse.json(
      { error: "instance_misconfigured" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "300",
        },
      },
    ),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|otf|pdf|png|svg|ttf|webmanifest|webp|woff2?)$).*)",
  ],
};
