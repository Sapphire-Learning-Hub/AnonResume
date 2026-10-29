"use client";
import { useCallback, useState } from "react";
import { Button, Spin } from "antd";
import { AppRouteLink } from "@/components/ui/AppRouteLoading";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fetchReviewJobContext,
  saveReviewJobContext,
} from "@/lib/job-search/client";
import {
  useJobFeedback,
  useJobResource,
} from "@/components/dashboard/job-search/useJobSearch";
import type { ReviewDetails } from "@/lib/ai/review/validation";
import { ReviewJobCapture } from "./ReviewJobCapture";
export function ReviewJobLinks({ details }: { details: ReviewDetails }) {
  const { t } = useI18n();
  const feedback = useJobFeedback();
  const [capture, setCapture] = useState(false);
  const state = useJobResource(
    useCallback(() => fetchReviewJobContext(details.id), [details.id]),
  );
  if (state.loading) return <Spin size="small" />;
  if (state.failed)
    return <Button onClick={state.reload}>{t("jobs.retry")}</Button>;
  return (
    <>
      {state.data?.context ? (
        <AppRouteLink
          type="link"
          href={`/app/job-search?opportunity=${encodeURIComponent(state.data.context.opportunityId)}`}
        >
          {t("jobs.viewJob")}
        </AppRouteLink>
      ) : (
        <Button onClick={() => setCapture(true)}>
          {t("jobs.saveFromReview")}
        </Button>
      )}
      {capture ? (
        <ReviewJobCapture
          initial={{
            title: details.input.targetRole,
            description: details.input.jobDescription,
          }}
          reviewId={details.id}
          onCancel={() => setCapture(false)}
          onSaved={(_job, context) => {
            setCapture(false);
            function link() {
              void saveReviewJobContext(details.id, context)
                .then(state.reload)
                .catch((error) => feedback.error(error, link));
            }
            link();
          }}
        />
      ) : null}
    </>
  );
}
