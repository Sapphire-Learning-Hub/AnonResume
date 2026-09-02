import { NextResponse } from "next/server";

const FORBIDDEN_RESPONSE = NextResponse.json(
  { error: "forbidden" },
  { status: 403 },
);

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

export function requireSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const originHeader = getOrigin(request.headers.get("origin"));

  if (originHeader) {
    return originHeader === requestOrigin ? null : FORBIDDEN_RESPONSE;
  }

  const refererOrigin = getOrigin(request.headers.get("referer"));

  if (refererOrigin) {
    return refererOrigin === requestOrigin ? null : FORBIDDEN_RESPONSE;
  }

  return FORBIDDEN_RESPONSE;
}
