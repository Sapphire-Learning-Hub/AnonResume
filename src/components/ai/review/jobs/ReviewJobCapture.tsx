"use client";
import { useClosingDialog } from "@/components/dashboard/job-search/useClosingDialog";
import { useRef, useState } from "react";
import { Button, Modal, Segmented } from "antd";
import type {
  JobFields,
  JobReviewContext,
  Opportunity,
} from "@/domain/job-search/schema";
import {
  editJobOpportunity,
  saveJobOpportunity,
} from "@/lib/job-search/client";
import { useI18n } from "@/i18n/I18nProvider";
import { OpportunityForm } from "@/components/dashboard/job-search/forms/OpportunityForm";
import { useJobFeedback } from "@/components/dashboard/job-search/useJobSearch";
import { useAiReviewStyles } from "@/components/ai/review/AiReview.style";
export function ReviewJobCapture({
  initial,
  selected,
  applicationId,
  reviewId,
  onSaved,
  onOnlyReview,
  onCancel,
}: {
  initial: Partial<JobFields>;
  selected?: Opportunity;
  applicationId?: string;
  reviewId?: string;
  onSaved: (job: Opportunity, context: JobReviewContext) => void;
  onOnlyReview?: () => void;
  onCancel: () => void;
}) {
  const dialog = useClosingDialog(onCancel);
  const { t } = useI18n();
  const { styles } = useAiReviewStyles();
  const feedback = useJobFeedback();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [mode, setMode] = useState<"update" | "new">(
    selected ? "update" : "new",
  );
  return (
    <Modal
      open={dialog.open}
      afterClose={dialog.afterClose}
      title={t("jobs.captureTitle")}
      onCancel={busy ? undefined : () => dialog.close()}
      closable={!busy}
      mask={{ closable: !busy }}
      footer={null}
      destroyOnHidden
    >
      <div className={styles.stack}>
        <p className={styles.muted}>
          {t(selected ? "jobs.captureChanged" : "jobs.capturePrompt")}
        </p>
        {selected ? (
          <Segmented
            disabled={busy}
            value={mode}
            onChange={setMode}
            options={[
              { value: "update", label: t("jobs.captureUpdate") },
              { value: "new", label: t("jobs.captureNew") },
            ]}
          />
        ) : null}
        <OpportunityForm
          initial={initial}
          editing={mode === "update"}
          readonlyDescription={Boolean(reviewId)}
          submitLabel={t(
            mode === "update"
              ? "jobs.captureUpdate"
              : onOnlyReview
                ? "jobs.captureSave"
                : "jobs.save",
          )}
          onCancel={() => dialog.close()}
          onUseExisting={(job) =>
            dialog.close(() => onSaved(job, { opportunityId: job.id }))
          }
          onSave={async (fields, createApplication, operationId) => {
            if (lock.current) return false;
            lock.current = true;
            setBusy(true);
            try {
              if (selected && mode === "update") {
                const job = await editJobOpportunity(selected.id, {
                  ...fields,
                  version: selected.version,
                  operationId,
                });
                dialog.close(() =>
                  onSaved(job, {
                    opportunityId: job.id,
                    ...(applicationId ? { applicationId } : {}),
                  }),
                );
              } else {
                const saved = await saveJobOpportunity({
                  ...fields,
                  createApplication,
                  operationId,
                  ...(reviewId ? { reviewId } : {}),
                });
                dialog.close(() =>
                  onSaved(saved.opportunity, {
                    opportunityId: saved.opportunity.id,
                    ...(saved.applicationId
                      ? { applicationId: saved.applicationId }
                      : {}),
                  }),
                );
              }
              return true;
            } catch (error) {
              feedback.error(error);
              return false;
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        />
        {onOnlyReview ? (
          <div className={styles.actions}>
            <Button disabled={busy} onClick={() => dialog.close(onOnlyReview)}>
              {t("jobs.onlyReview")}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
