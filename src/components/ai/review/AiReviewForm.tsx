"use client";

import { useState } from "react";
import { Button, Input, Select } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import type { AiModelOption } from "@/lib/ai/client";
import { useAiReviewStyles } from "./AiReview.style";

export function AiReviewForm({ models, busy, onStart }: { models: AiModelOption[]; busy: boolean; onStart: (input: { modelId: string; targetRole: string; jobDescription: string }) => void }) {
  const { styles } = useAiReviewStyles();
  const { t } = useI18n();
  const [modelId, setModelId] = useState<string>();
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const chosen = models.some((model) => model.id === modelId) ? modelId : models[0]?.id;
  return <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); if (chosen && !busy) onStart({ modelId: chosen, targetRole, jobDescription }); }}>
    <label className={styles.field}><span>{t("ai.model")}</span><Select aria-label={t("ai.model")} value={chosen} disabled={busy || !models.length} options={models.map((model) => ({ value: model.id, label: `${model.providerName} / ${model.displayName}` }))} onChange={setModelId} /></label>
    <label className={styles.field}><span>{t("aiReview.role")}</span><Input maxLength={200} value={targetRole} disabled={busy} onChange={(event) => setTargetRole(event.target.value)} /></label>
    <label className={styles.field}><span>{t("aiReview.description")}</span><Input.TextArea autoSize={{ minRows: 6, maxRows: 12 }} maxLength={16000} value={jobDescription} disabled={busy} onChange={(event) => setJobDescription(event.target.value)} /></label>
    {!models.length ? <p className={styles.muted}>{t("aiReview.unavailable")}</p> : null}
    <p className={styles.muted}>{t("aiReview.requestCost")}</p>
    <div className={styles.actions}><Button htmlType="submit" type="primary" loading={busy} disabled={!chosen}>{t("aiReview.start")}</Button></div>
  </form>;
}
