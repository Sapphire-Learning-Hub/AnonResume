"use client";

import { useRef, useState } from "react";
import { Button, Empty, Popconfirm, Segmented, Select, Spin, Tag } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { AiPanelFrame } from "@/components/ai/AiPanelFrame";
import { AiClientError, stopAiRun } from "@/lib/ai/client";
import { deleteResumeReview, generateReviewSuggestions, ignoreReviewIssue, startResumeReview } from "@/lib/ai/review/client";
import type { ReviewDetails } from "@/lib/ai/review/validation";
import { useAiReview } from "./useAiReview";
import { AiReviewForm } from "./AiReviewForm";
import { AiReviewReport } from "./AiReviewReport";
import { useAiReviewStyles } from "./AiReview.style";
import { reviewFailureMessage, reviewProgressMessage } from "./review-feedback";

export function AiReviewPanel({ resumeId, resumeVersion, onClose, onEnsureSaved, onLocate, onOpenSuggestions }: {
  resumeId: string; resumeVersion: number; onClose: () => void;
  onEnsureSaved: () => Promise<{ resumeVersion: number } | null>;
  onLocate: (target: ReviewDetails["targets"][number]) => void;
  onOpenSuggestions: (conversationId: string) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const { notification } = useAppFeedback();
  const { styles } = useAiReviewStyles();
  const [view, setView] = useState<"new" | "history">("new");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  function reportError(error: unknown) {
    const code = error instanceof AiClientError ? error.code : "unknown";
    const description = t(code === "ai_unavailable" ? "aiReview.unavailable" : code === "ai_quota_exceeded" ? "ai.error.quota" : code === "ai_resume_version_conflict" ? "ai.error.versionConflict" : code === "ai_run_already_active" ? "ai.error.activeRun" : code === "ai_review_empty" ? "aiReview.emptyError" : code === "ai_review_context_limit" ? "aiReview.contextError" : code === "ai_review_facts_required" ? "aiReview.factsRequired" : code === "ai_review_save_failed" ? "aiReview.saveError" : "aiReview.error");
    notification.error({ key: "ai-review-error", title: t("aiReview.title"), description, duration: false, actions: <Button size="small" onClick={() => review.refresh()}>{t("aiReview.retry")}</Button> });
  }
  const review = useAiReview({ resumeId, resumeVersion, onError: reportError });
  const details = review.details;
  const running = details && ["queued", "preparing", "streaming"].includes(details.status);

  async function perform(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await work(); } catch (error) { reportError(error); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function saved() {
    try {
      const result = await onEnsureSaved();
      if (result) return result;
    } catch { /* The editor retains its save diagnostics. */ }
    throw new AiClientError("ai_review_save_failed", 409);
  }
  const stage = details?.progress.at(-1);
  const completedDimensions = new Set(details?.progress.filter((value) => value.startsWith("review_dimension_"))).size;
  return <AiPanelFrame title={t("aiReview.title")} onClose={onClose}><div className={styles.body}><div className={styles.stack}>
    <Segmented block value={view} options={[{ value: "new", label: t("aiReview.new") }, { value: "history", label: t("aiReview.history") }]} onChange={setView} />
    {view === "new" && running ? <Button onClick={() => setView("history")}>{t("aiReview.running")}</Button> : null}
    {view === "new" ? <AiReviewForm models={review.models} busy={busy || Boolean(running)} onStart={(input) => void perform(async () => {
      const snapshot = await saved();
      const result = await startResumeReview(resumeId, { ...input, ...snapshot, locale });
      review.setSelectedId(result.reviewId);
      review.refresh();
      setView("history");
    })} /> : <>
      <div className={styles.stack}>
        <Select
          aria-label={t("aiReview.selectRecord")}
          className={styles.historySelect}
          placeholder={t("aiReview.selectRecord")}
          value={review.selectedId}
          loading={review.loading}
          disabled={!review.page.items.length}
          onChange={review.setSelectedId}
          options={review.page.items.map((item) => ({
            value: item.id,
            label: `${new Date(item.createdAt).toLocaleString(locale)} · ${item.score === null ? t(item.status === "stopped" ? "aiReview.stopped" : ["queued", "preparing", "streaming"].includes(item.status) ? "aiReview.running" : "aiReview.failed") : t("aiReview.scoreValue", { score: item.score })}`,
          }))}
        />
        {!review.page.items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("aiReview.empty")} /> : null}
        <div className={styles.actions}><Button onClick={review.refresh}>{t("aiReview.retry")}</Button>{review.page.nextCursor ? <Button onClick={() => void perform(review.loadMore)}>{t("aiReview.more")}</Button> : null}</div>
      </div>
      {review.loadError ? <Empty description={t("aiReview.loadError")}><Button onClick={review.refresh}>{t("aiReview.retry")}</Button></Empty> : null}
      {review.loading && !details ? <Spin aria-label={t("aiReview.running")} /> : null}
      {running ? <div className={styles.card} role="status" aria-live="polite"><Spin /><strong>{t(details.status === "queued" ? "aiReview.queued" : "aiReview.running")}</strong>{stage ? <span>{t(reviewProgressMessage(stage))}</span> : null}{completedDimensions ? <span>{t("aiReview.dimensionsProgress", { count: completedDimensions })}</span> : null}<div className={styles.actions}><Button disabled={busy} onClick={() => void perform(async () => { await stopAiRun(details.runId); review.refresh(); })}>{t("aiReview.stop")}</Button></div></div> : null}
      {details && !running ? <>
        <div className={styles.filters}><Tag>{details.input.targetRole || details.input.jobDescription ? t("aiReview.job") : t("aiReview.general")}</Tag><span className={styles.muted}>{details.modelName}</span></div>
        {!details.report ? <Empty description={t(details.status === "stopped" ? "aiReview.stopped" : reviewFailureMessage(details.failureCode))} /> : <AiReviewReport key={details.id} details={details} busy={busy}
          onLocate={onLocate}
          onIgnore={(issueId, ignored) => void perform(async () => { review.setDetails(await ignoreReviewIssue(details.id, issueId, ignored)); })}
          onGenerate={(ids, facts) => void perform(async () => {
            const snapshot = await saved();
            const result = await generateReviewSuggestions(details.id, ids, snapshot.resumeVersion, facts);
            if (!(await onOpenSuggestions(result.conversationId))) throw new AiClientError("ai_review_save_failed", 409);
          })} />}
        <div className={styles.actions}><Popconfirm title={t("aiReview.delete")} onConfirm={() => perform(async () => { await deleteResumeReview(details.id); review.setSelectedId(undefined); review.setDetails(undefined); review.refresh(); })}><Button danger disabled={busy}>{t("common.delete")}</Button></Popconfirm></div>
      </> : null}
    </>}
  </div></div></AiPanelFrame>;
}
