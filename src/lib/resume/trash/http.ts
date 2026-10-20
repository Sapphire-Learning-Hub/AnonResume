import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/lib/auth/session";
import {
  AccountMergeError,
  getAccountMergeErrorStatus,
} from "@/lib/auth/account/merge/errors";
import {
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  ResumeNotFoundError,
  ResumeVersionSnapshotNotFoundError,
} from "@/lib/resume/repository";
import {
  ResumeTrashedError,
  ResumeTrashBusyError,
  ResumeTrashExpiredError,
} from "./errors";
import { purgeTrashedResume, restoreTrashedResume } from "./service";

export function withResumeLifecycleErrors<Arguments extends unknown[]>(
  handler: (...args: Arguments) => Promise<Response>,
) {
  return async (...args: Arguments): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (
        error instanceof ResumeTrashedError ||
        error instanceof ResumeTrashBusyError ||
        error instanceof ResumeTrashExpiredError
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (
        error instanceof ResumeNotFoundError ||
        error instanceof ResumeVersionSnapshotNotFoundError
      ) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (error instanceof AccountMergeError)
        return NextResponse.json(
          { error: error.code },
          { status: getAccountMergeErrorStatus(error.code) },
        );
      throw error;
    }
  };
}

export async function handleTrashMutation(
  request: Request,
  context: { params: Promise<{ id: string }> },
  action: "restore" | "purge",
) {
  const forbidden = requireSameOrigin(request);
  if (forbidden) return forbidden;
  const session = await getOptionalSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (request.body) {
    try {
      z.object({})
        .strict()
        .parse(await parseLimitedJsonRequest(request));
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        return NextResponse.json(
          { error: "payload_too_large" },
          { status: 413 },
        );
      if (error instanceof SyntaxError || error instanceof z.ZodError)
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      throw error;
    }
  }
  const { id } = await context.params;
  const input = { userId: session.user.id, resumeId: id };
  if (action === "restore")
    return NextResponse.json({ resume: await restoreTrashedResume(input) });
  await purgeTrashedResume(input);
  return new Response(null, { status: 204 });
}
