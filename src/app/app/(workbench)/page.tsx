import { ResumeDashboardShell } from "@/components/dashboard/ResumeDashboardShell";
import { requireSession } from "@/lib/auth/session";
import {
  parsePageRequest,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";
import { paginateResumeEntries } from "@/lib/resume/repository";

export default async function DashboardPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<PaginationSearchParams>;
} = {}) {
  const session = await requireSession();
  const resolvedSearchParams = await searchParams;
  const request = parsePageRequest(resolvedSearchParams);
  const queryValue = resolvedSearchParams.q;
  const query = (Array.isArray(queryValue) ? queryValue[0] : queryValue) ?? "";
  const result = await paginateResumeEntries({
    userId: session.user.id,
    ...request,
    query,
  });

  return (
    <ResumeDashboardShell
      createAction="/app/create-resume"
      pagination={result}
      resumes={result.items}
      searchParams={resolvedSearchParams}
      searchQuery={query}
    />
  );
}
