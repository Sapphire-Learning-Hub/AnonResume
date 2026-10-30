"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";

import { useState } from "react";
import { Button, Checkbox, Empty, Input, Progress, Select, Tag } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { reviewDimensions } from "@/domain/resume/ai/review/schema";
import type { ReviewDetails } from "@/lib/ai/review/validation";
import { useAiReviewStyles } from "./AiReview.style";

export function AiReviewReport({ details, busy, onGenerate, onIgnore, onLocate }: {
  details: ReviewDetails; busy: boolean;
  onGenerate: (ids: string[], facts: string) => void;
  onIgnore: (id: string, ignored: boolean) => void;
  onLocate: (target: ReviewDetails["targets"][number]) => void;
}) {
  const { styles } = useAiReviewStyles();
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [dimension, setDimension] = useState<string>();
  const [severity, setSeverity] = useState<string>();
  const [showIgnored, setShowIgnored] = useState(false);
  const [facts, setFacts] = useState("");
  const report = details.report;
  if (!report) return null;
  const selectedIssues = report.issues.filter((issue) => selected.includes(issue.id) && !details.ignoredIssueIds.includes(issue.id));
  const missingFacts = selectedIssues.some((issue) => issue.kind === "missing") && !facts.trim();
  const issues = report.issues.filter((issue) => (!dimension || issue.dimension === dimension) && (!severity || issue.severity === severity) && (showIgnored || !details.ignoredIssueIds.includes(issue.id)));
  return <div className={styles.stack}>
    {details.stale ? <div className={styles.warning} role="status">{t("aiReview.stale")}</div> : null}
    <div className={styles.score}><strong>{t("aiReview.score")}</strong><span className={styles.number}>{t("aiReview.scoreValue", { score: report.score })}</span></div>
    <p className={styles.paragraph}>{report.summary}</p>
    <div className={styles.stack}>{report.dimensions.map((entry) => <div key={entry.dimension} className={styles.field}>
      <strong><InlineMetadata><span>{t(`aiReview.dimension.${entry.dimension}`)}</span><span>{t("aiReview.grade", { grade: entry.grade })}</span></InlineMetadata></strong>
      <Progress percent={entry.grade * 25} showInfo={false} size="small" />
      <p className={styles.muted}>{entry.reason}</p>
    </div>)}</div>
    {report.strengths.length ? <div className={styles.stack}><h3 className={styles.title}>{t("aiReview.strengths")}</h3>{report.strengths.map((value, index) => <p className={styles.paragraph} key={index}>{value}</p>)}</div> : null}
    {report.match ? <div className={styles.stack}>
      <h3 className={styles.title}><InlineMetadata><span>{t("aiReview.match")}</span>{report.match.score !== null ? <span>{t("aiReview.scoreValue", { score: report.match.score })}</span> : null}</InlineMetadata></h3>
      <p className={styles.paragraph}>{report.match.summary}</p>
      {report.match.requirements.map((entry, index) => <div className={styles.card} key={index}>
        <strong>{entry.text}</strong>
        <div><Tag>{t(entry.source === "description" ? "aiReview.explicit" : "aiReview.inferred")}</Tag><Tag>{t(`aiReview.${entry.status}`)}</Tag></div>
        <p className={styles.paragraph}>{entry.reason}</p>
        {entry.evidence.map((item, quoteIndex) => <blockquote className={styles.quote} key={quoteIndex}>{item.quote}</blockquote>)}
      </div>)}
    </div> : null}
    <h3 className={styles.title}>{t("aiReview.issues")}</h3>
    <div className={styles.filters}>
      <Select className={styles.filter} allowClear value={dimension} placeholder={t("aiReview.allDimensions")} aria-label={t("aiReview.allDimensions")} options={reviewDimensions.map((value) => ({ value, label: t(`aiReview.dimension.${value}`) }))} onChange={setDimension} />
      <Select className={styles.filter} allowClear value={severity} placeholder={t("aiReview.allSeverities")} aria-label={t("aiReview.allSeverities")} options={(["important", "suggestion", "minor"] as const).map((value) => ({ value, label: t(`aiReview.severity.${value}`) }))} onChange={setSeverity} />
      <Checkbox checked={showIgnored} onChange={(event) => setShowIgnored(event.target.checked)}>{t("aiReview.showIgnored")}</Checkbox>
    </div>
    {!issues.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("aiReview.noIssues")} /> : issues.map((issue) => {
      const ignored = details.ignoredIssueIds.includes(issue.id);
      const target = details.targets.find((item) => item.id === issue.evidence[0]?.targetId);
      return <div className={styles.card} data-ignored={ignored} key={issue.id}>
        <Checkbox checked={!ignored && selected.includes(issue.id)} disabled={ignored || busy} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, issue.id] : ids.filter((id) => id !== issue.id))}>{issue.title}</Checkbox>
        <div><Tag color={issue.severity === "important" ? "error" : "default"}>{t(`aiReview.severity.${issue.severity}`)}</Tag><Tag>{t(`aiReview.dimension.${issue.dimension}`)}</Tag></div>
        {issue.evidence.map((item, index) => <blockquote className={styles.quote} key={index}>{item.quote}</blockquote>)}
        <p className={styles.paragraph}>{issue.explanation}</p><p className={styles.paragraph}>{issue.suggestion}</p>
        <div className={styles.actions}>
          {target ? <Button size="small" onClick={() => onLocate(target)}>{t("aiReview.locate")}</Button> : issue.evidence.length ? <span className={styles.muted}>{t("aiReview.targetMissing")}</span> : null}
          <Button size="small" disabled={busy} onClick={() => onIgnore(issue.id, !ignored)}>{t(ignored ? "aiReview.restore" : "aiReview.ignore")}</Button>
        </div>
      </div>;
    })}
    {selectedIssues.length ? <>
      <label className={styles.field}><span>{t("aiReview.facts")}</span><Input.TextArea maxLength={8000} autoSize={{ minRows: 3, maxRows: 8 }} value={facts} placeholder={t("aiReview.factsHint")} disabled={busy} onChange={(event) => setFacts(event.target.value)} /></label>
      {missingFacts ? <span className={styles.muted}>{t("aiReview.factsRequired")}</span> : null}
      <div className={styles.actions}><Button type="primary" loading={busy} disabled={missingFacts} onClick={() => onGenerate(selectedIssues.map((issue) => issue.id), facts)}>{t("aiReview.generate")}</Button></div>
    </> : null}
  </div>;
}
