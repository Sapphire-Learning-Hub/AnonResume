"use client";

import { useState } from "react";
import { Button, Input, Select } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import type { AiModelOption } from "@/lib/ai/client";
import type { JobReviewContext, Opportunity } from "@/domain/job-search/schema";
import { useAiReviewStyles } from "./AiReview.style";
import { ReviewJobFields } from "./jobs/ReviewJobFields";
import { ReviewJobCapture } from "./jobs/ReviewJobCapture";

type ReviewStart = {
  modelId: string;
  targetRole: string;
  jobDescription: string;
  jobContext?: JobReviewContext;
};
export function AiReviewForm({
  models,
  busy,
  onStart,
}: {
  models: AiModelOption[];
  busy: boolean;
  onStart: (input: ReviewStart) => void;
}) {
  const { styles } = useAiReviewStyles();
  const { t } = useI18n();
  const [modelId, setModelId] = useState<string>();
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [job, setJob] = useState<Opportunity>();
  const [applicationId, setApplicationId] = useState<string>();
  const [pending, setPending] = useState<ReviewStart>();
  const chosen = models.some((model) => model.id === modelId)
    ? modelId
    : models[0]?.id;
  const context = job
    ? { opportunityId: job.id, ...(applicationId ? { applicationId } : {}) }
    : undefined;
  return (
    <>
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          if (!chosen || busy) return;
          const input = {
            modelId: chosen,
            targetRole,
            jobDescription,
            ...(context ? { jobContext: context } : {}),
          };
          if (
            jobDescription.trim() &&
            (!job ||
              job.title !== targetRole.trim() ||
              job.description !== jobDescription.trim())
          )
            setPending(input);
          else onStart(input);
        }}
      >
        <label className={styles.field}>
          <span>{t("ai.model")}</span>
          <Select
            aria-label={t("ai.model")}
            value={chosen}
            disabled={busy || !models.length}
            options={models.map((model) => ({
              value: model.id,
              label: `${model.providerName} / ${model.displayName}`,
            }))}
            onChange={setModelId}
          />
        </label>
        <ReviewJobFields
          job={job}
          applicationId={applicationId}
          disabled={busy}
          onApplication={setApplicationId}
          onJob={(selected) => {
            setJob(selected);
            setApplicationId(undefined);
            if (selected) {
              setTargetRole(selected.title);
              setJobDescription(selected.description);
            }
          }}
        />
        <label className={styles.field}>
          <span>{t("aiReview.role")}</span>
          <Input
            maxLength={200}
            value={targetRole}
            disabled={busy}
            onChange={(event) => setTargetRole(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t("aiReview.description")}</span>
          <Input.TextArea
            autoSize={{ minRows: 6, maxRows: 12 }}
            maxLength={16000}
            value={jobDescription}
            disabled={busy}
            onChange={(event) => setJobDescription(event.target.value)}
          />
        </label>
        {!models.length ? (
          <p className={styles.muted}>{t("aiReview.unavailable")}</p>
        ) : null}
        <p className={styles.muted}>{t("aiReview.requestCost")}</p>
        <div className={styles.actions}>
          <Button
            htmlType="submit"
            type="primary"
            loading={busy}
            disabled={!chosen}
          >
            {t("aiReview.start")}
          </Button>
        </div>
      </form>
      {pending ? (
        <ReviewJobCapture
          initial={{
            title: pending.targetRole,
            description: pending.jobDescription,
            ...(job
              ? {
                  company: job.company,
                  url: job.url,
                  source: job.source,
                  notes: job.notes,
                }
              : {}),
          }}
          selected={job}
          applicationId={applicationId}
          onCancel={() => setPending(undefined)}
          onOnlyReview={() => {
            setPending(undefined);
            onStart(pending);
          }}
          onSaved={(saved, jobContext) => {
            setJob(saved);
            setApplicationId(jobContext.applicationId);
            setTargetRole(saved.title);
            setJobDescription(saved.description);
            setPending(undefined);
            onStart({
              ...pending,
              targetRole: saved.title,
              jobDescription: saved.description,
              jobContext,
            });
          }}
        />
      ) : null}
    </>
  );
}
