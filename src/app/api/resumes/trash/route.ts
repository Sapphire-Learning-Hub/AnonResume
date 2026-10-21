import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/auth/session";
import { withRequestLogging } from "@/lib/observability/http";
import { paginateTrashedResumes } from "@/lib/resume/trash/service";
import { parsePageRequest } from "@/lib/shared/pagination";

async function get(request: Request) {
  const session = await getOptionalSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  return NextResponse.json(
    await paginateTrashedResumes({
      userId: session.user.id,
      ...parsePageRequest(Object.fromEntries(params)),
      query: params.get("q") ?? undefined,
    }),
  );
}
export const GET = withRequestLogging("/api/resumes/trash", get);
