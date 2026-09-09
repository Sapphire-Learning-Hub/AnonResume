import { NextResponse } from "next/server";

function getOrigin(value: string | null) {
  if (!value || value === "null") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getConfiguredApplicationOrigin() {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const configuredUrl = getOrigin(process.env.BETTER_AUTH_URL ?? null);

  return configuredUrl;
}

export function getExpectedRequestOrigin(request: Request) {
  return getConfiguredApplicationOrigin() ?? new URL(request.url).origin;
}

function createForbiddenResponse() {
  // A Response body can only be consumed once, so this must be request-scoped.
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function requireSameOrigin(request: Request) {
  const requestOrigin = getExpectedRequestOrigin(request);
  const originHeader = getOrigin(request.headers.get("origin"));

  if (originHeader) {
    return originHeader === requestOrigin ? null : createForbiddenResponse();
  }

  const refererOrigin = getOrigin(request.headers.get("referer"));

  if (refererOrigin) {
    return refererOrigin === requestOrigin ? null : createForbiddenResponse();
  }

  return createForbiddenResponse();
}

export function createApplicationUrl(path: string, request: Request) {
  return new URL(path, getExpectedRequestOrigin(request));
}
