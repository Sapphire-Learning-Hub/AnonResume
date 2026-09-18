import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { stopAiRun } from "@/lib/ai/runs/recovery";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const stopRunSchema = z
  .object({
    retract: z.enum(["if-empty", "always"]).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = request.headers.get("content-type")?.includes("application/json")
    ? stopRunSchema.parse(
        await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
      )
    : {};
  const stopped = await stopAiRun({
    userId: session.user.id,
    runId: id,
    retract: body.retract,
  });
  if (!stopped) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (typeof stopped !== "boolean") {
    return Response.json(stopped);
  }
  return Response.json({ stopped: true });
}
