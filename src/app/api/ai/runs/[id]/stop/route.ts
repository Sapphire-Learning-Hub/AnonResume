import { getOptionalSession } from "@/lib/auth/session";
import { stopAiRun } from "@/lib/ai/runs/recovery";
import { requireSameOrigin } from "@/lib/http/request-origin";

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
  const stopped = await stopAiRun({ userId: session.user.id, runId: id });
  if (!stopped) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ stopped: true });
}
