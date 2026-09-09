import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { parsePageRequest } from "@/lib/pagination";
import { paginateResumeEntries } from "@/lib/resume-repository";

export async function GET(request: Request) {
  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const pageRequest = parsePageRequest(searchParams);

  return NextResponse.json(
    await paginateResumeEntries({
      userId: session.user.id,
      ...pageRequest,
      query: url.searchParams.get("q") ?? undefined,
    }),
  );
}
