import { ResumeTrashShell } from "@/components/dashboard/trash/ResumeTrashShell";
import { requireSession } from "@/lib/auth/session";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { paginateTrashedResumes } from "@/lib/resume/trash/service";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const query = readSearchParam(params, "q") ?? "";
  let page: Awaited<ReturnType<typeof paginateTrashedResumes>> | undefined;
  try {
    page = await paginateTrashedResumes({
      userId: session.user.id,
      ...parsePageRequest(params),
      query,
    });
  } catch (error) {
    getLogger("anonresume.resume").error("trash_list_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
  }
  return <ResumeTrashShell initialPage={page} initialQuery={query} />;
}
