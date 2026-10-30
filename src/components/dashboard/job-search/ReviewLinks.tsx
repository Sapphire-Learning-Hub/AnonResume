"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";
import { useCallback, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { AppRouteLink } from "@/components/ui/AppRouteLoading";
import { useI18n } from "@/i18n/I18nProvider";
import { fetchOpportunityReviews } from "@/lib/job-search/client";
import { useJobResource, useJobFeedback } from "./useJobSearch";
import { useJobSearchStyles } from "./styles";
export function ReviewLinks({
  opportunityId,
  applicationId,
}: {
  opportunityId: string;
  applicationId?: string;
}) {
  const { t, locale } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const [more, setMore] = useState(false);
  const state = useJobResource(
    useCallback(
      (signal: AbortSignal) =>
        fetchOpportunityReviews(
          opportunityId,
          undefined,
          applicationId,
          signal,
        ),
      [opportunityId, applicationId],
    ),
  );
  return (
    <section className={styles.stack} aria-label={t("jobs.reviews")}>
      <strong>{t("jobs.reviews")}</strong>
      {state.loading ? (
        <Spin />
      ) : state.failed ? (
        <Empty description={t("jobs.loadError")}>
          <Button onClick={state.reload}>{t("jobs.retry")}</Button>
        </Empty>
      ) : !state.data?.items.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("jobs.empty")}
        />
      ) : null}
      {state.data?.items.map((review) => (
        <div className={styles.record} key={review.reviewId}>
          <div>
            {new Date(review.createdAt).toLocaleString(locale)}
            <div className={styles.muted}>
              <InlineMetadata><span>{review.resumeName}</span>{review.score !== null ? <span>{t("aiReview.scoreValue", { score: review.score })}</span> : null}</InlineMetadata>
            </div>
          </div>
          {review.available && review.resumeId ? (
            <AppRouteLink
              href={`/app/resumes/${encodeURIComponent(review.resumeId)}?review=${encodeURIComponent(review.reviewId)}`}
              type="link"
            >
              {t("jobs.openReview")}
            </AppRouteLink>
          ) : (
            <span className={styles.muted}>{t("jobs.reviewUnavailable")}</span>
          )}
        </div>
      ))}
      {state.data?.nextCursor ? (
        <Button
          loading={more}
          onClick={async () => {
            if (more) return;
            setMore(true);
            try {
              const next = await fetchOpportunityReviews(
                opportunityId,
                state.data!.nextCursor!,
                applicationId,
              );
              state.setData((old) =>
                old
                  ? {
                      ...next,
                      items: [
                        ...old.items,
                        ...next.items.filter(
                          (row) =>
                            !old.items.some(
                              (item) => item.reviewId === row.reviewId,
                            ),
                        ),
                      ],
                    }
                  : next,
              );
            } catch (error) {
              feedback.error(error);
            } finally {
              setMore(false);
            }
          }}
        >
          {t("jobs.more")}
        </Button>
      ) : null}
    </section>
  );
}
