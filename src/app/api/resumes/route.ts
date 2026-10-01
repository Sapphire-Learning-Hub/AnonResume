import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { parsePageRequest } from "@/lib/shared/pagination";
import { paginateResumeEntries } from "@/lib/resume/repository";

export async function GET(request: Request) {
  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const pageRequest = parsePageRequest(searchParams);
  const publicationValues = url.searchParams.getAll("publication");

  if (
    publicationValues.length > 1 ||
    (publicationValues[0] !== undefined &&
      publicationValues[0] !== "all" &&
      publicationValues[0] !== "published")
  ) {
    return NextResponse.json(
      { error: "invalid_publication" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await paginateResumeEntries({
      userId: session.user.id,
      ...pageRequest,
      query: url.searchParams.get("q") ?? undefined,
      publication: publicationValues[0] ?? "all",
    }),
  );
}
