import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { TemplateError, templateErrorStatus } from "./errors";

export type TemplateRouteContext = { params: Promise<{ id: string }> };
export function templateRoute<Args extends [Request, ...unknown[]]>(
  handler: (userId: string, ...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    const [request] = args;
    let response: Response;
    try {
      const forbidden =
        request.method !== "GET" ? requireSameOrigin(request) : null;
      const session = forbidden ? null : await getOptionalSession();
      response =
        forbidden ??
        (!session
          ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
          : await handler(session.user.id, ...args));
    } catch (error) {
      if (error instanceof TemplateError)
        response = NextResponse.json(
          { error: error.code },
          { status: templateErrorStatus(error.code) },
        );
      else if (error instanceof RequestBodyTooLargeError)
        response = NextResponse.json(
          { error: "payload_too_large" },
          { status: 413 },
        );
      else if (error instanceof z.ZodError || error instanceof SyntaxError)
        response = NextResponse.json(
          { error: "invalid_request" },
          { status: 400 },
        );
      else throw error;
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
export async function templateBody<T>(request: Request, schema: z.ZodType<T>) {
  return schema.parse(
    await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
  );
}
