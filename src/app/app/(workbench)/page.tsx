import { redirect } from "next/navigation";

import { ResumeDashboardShell } from "@/components/dashboard/ResumeDashboardShell";
import { getRequestLocale } from "@/i18n/server";
import { requireSession } from "@/lib/auth/session";
import { prepareEditorOnboardingEntry } from "@/lib/onboarding/service";
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
  const locale = await getRequestLocale();
  const onboarding = await prepareEditorOnboardingEntry({
    userId: session.user.id,
    sessionId: session.session.id,
    locale,
  });

  if (onboarding.autoOpenHref) {
    redirect(onboarding.autoOpenHref);
  }

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
      onboardingContinuation={
        onboarding.continueHref &&
        onboarding.run &&
        (onboarding.run.status === "active" ||
          onboarding.run.status === "paused")
          ? {
              href: onboarding.continueHref,
              status: onboarding.run.status,
              currentStep: onboarding.run.currentStep,
            }
          : undefined
      }
      pagination={result}
      resumes={result.items}
      searchParams={resolvedSearchParams}
      searchQuery={query}
    />
  );
}
