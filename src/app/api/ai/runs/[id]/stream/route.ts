import { withRequestLogging } from "@/lib/observability/http";

import { getOptionalSession } from "@/lib/auth/session";
import { streamAiRunSnapshots } from "@/lib/ai/runs/run-stream";
import { getAiRunSnapshot } from "@/lib/ai/runs/service";
import { encodeAiStreamEvent } from "@/lib/ai/runs/stream-events";

async function getHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const read = () => getAiRunSnapshot({ userId: session.user.id, runId: id });
  if (!(await read())) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAiRunSnapshots({
          read,
          signal: request.signal,
        })) {
          controller.enqueue(encoder.encode(encodeAiStreamEvent(event)));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

export const GET = withRequestLogging("/api/ai/runs/[id]/stream", getHandler);
