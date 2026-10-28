import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";
import { ImageAssetError, imageErrorStatus } from "./errors";

export type ImageRouteContext = { params: Promise<{ id: string }> };
export async function imageResponse(handler: () => Promise<Response>) {
  let response: Response;
  try {
    response = await handler();
  } catch (error) {
    if (error instanceof ImageAssetError)
      response = NextResponse.json(
        { error: error.code },
        { status: imageErrorStatus(error.code) },
      );
    else if (error instanceof RequestBodyTooLargeError)
      response = NextResponse.json(
        { error: "image_too_large" },
        { status: 413 },
      );
    else if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof URIError
    )
      response = NextResponse.json({ error: "image_invalid" }, { status: 400 });
    else throw error;
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export function imageRoute<Args extends [Request, ...unknown[]]>(
  handler: (userId: string, ...args: Args) => Promise<Response>,
) {
  return (...args: Args) =>
    imageResponse(async () => {
      const forbidden =
        args[0].method !== "GET" ? requireSameOrigin(args[0]) : null;
      if (forbidden) return forbidden;
      const session = await getOptionalSession();
      if (!session)
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      return handler(session.user.id, ...args);
    });
}
