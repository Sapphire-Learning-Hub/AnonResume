import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { JobSearchPage } from "@/components/dashboard/job-search/JobSearchPage";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const query = await searchParams;
  const id = z.string().uuid().safeParse(query.opportunity);
  return (
    <JobSearchPage
      key={id.success ? id.data : "root"}
      initialOpportunityId={id.success ? id.data : undefined}
    />
  );
}
