import { getOptionalSession } from "@/lib/auth/session";
import { getAiRunSnapshot } from "@/lib/ai/runs/recovery";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const run = await getAiRunSnapshot({ userId: session.user.id, runId: id });
  if (!run) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ run });
}
