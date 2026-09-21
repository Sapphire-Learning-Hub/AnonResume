import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getExpectedRequestOrigin } from "@/lib/http/request-origin";
import { validateBootstrapConfiguration } from "@/lib/config/bootstrap";

const configurationErrorPath = "/configuration-error";

export function proxy(request: NextRequest) {
  const configuration = validateBootstrapConfiguration();
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-anonresume-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  if (configuration.valid) {
    if (
      (request.nextUrl.pathname.startsWith("/api/manage/") ||
        request.nextUrl.pathname.startsWith("/api/setup/")) &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== getExpectedRequestOrigin(request)) {
        return NextResponse.json(
          { error: "invalid_request_origin" },
          { status: 403, headers: { "Cache-Control": "no-store" } },
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
    return response;
  }

  return NextResponse.json(
    { error: "instance_misconfigured" },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
      },
    },
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|brand/|font-licenses/|icon.png|apple-icon.png|opengraph-image.png).*)",
  ],
};
