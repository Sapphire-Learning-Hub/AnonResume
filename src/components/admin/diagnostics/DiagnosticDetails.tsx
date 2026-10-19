"use client";

import { Alert, Descriptions, Space, Tag, Timeline, Typography } from "antd";
import type { AppLocale } from "@/i18n/messages";
import { createDiagnosticTranslator, type DiagnosticMessageKey } from "@/i18n/diagnostics-messages";
import type { DiagnosticDetails as Details } from "@/lib/observability/diagnostics/store/schema";
import { useDiagnosticStyles } from "./styles";

const names: Record<string, DiagnosticMessageKey> = {
  "app.pdf.render": "stage.app.pdf.render", "app.pdf.save": "stage.app.pdf.save",
  "app.http.request": "stage.app.http.request", "app.ai.execute": "stage.app.ai.execute", "app.pdf.execute": "stage.app.pdf.execute", "app.ai.review.round": "stage.app.ai.review.round", "app.ai.provider.round": "stage.app.ai.provider.round", "app.email.send": "stage.app.email.send", "task.queued": "stage.task.queued", "task.finished": "stage.task.finished", "app.operation": "stage.app.operation",
};
export function DiagnosticDetails({ data, locale }: { data: Details; locale: AppLocale }) {
  const t = createDiagnosticTranslator(locale);
  const { styles } = useDiagnosticStyles();
  const fault = data.fault;
  const copy = (value: string | null | undefined) => value ? <Typography.Text copyable>{value}</Typography.Text> : "—";
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
    <Descriptions bordered column={1} size="small" items={[
      { key: "id", label: t("identifier"), children: copy(data.diagnosticId) },
      { key: "request", label: t("request"), children: copy(fault.requestId) },
      { key: "task", label: t("task"), children: copy(fault.taskId) },
      { key: "time", label: t("time"), children: date(fault.at) },
      { key: "source", label: t("source"), children: t(`source.${fault.source}`) },
      { key: "reason", label: t("reason"), children: fault.error ? t(`category.${fault.error.category}`) : "—" },
      { key: "error", label: t("error"), children: `${fault.error?.type ?? "Error"} / ${fault.error?.code ?? "—"}` },
      { key: "attempt", label: t("attempt"), children: fault.attempt ?? "—" },
      { key: "timeout", label: t("timeoutPhase"), children: fault.timeoutPhase ? t(`timeout.${fault.timeoutPhase}`) : "—" },
      { key: "instance", label: t("instance"), children: fault.identity.instance },
      { key: "role", label: t("role"), children: fault.identity.role },
      { key: "build", label: t("build"), children: copy(fault.identity.build) },
      { key: "release", label: t("release"), children: fault.identity.release },
      { key: "environment", label: t("environment"), children: fault.identity.environment },
      { key: "causes", label: t("causes"), children: fault.error?.causes.map((cause) => `${cause.type}: ${cause.code ?? "—"}`).join(" → ") || "—" },
    ]} />
    {fault.reference ? <>
      {fault.source === "browser" ? <Alert type="info" title={t("client")} /> : null}
      <Descriptions column={1} items={[
        { key: "build", label: t("clientBuild"), children: fault.reference.clientBuild ?? "—" },
        { key: "digest", label: t("digest"), children: copy(fault.reference.digest) },
      ]} />
    </> : null}
    {fault.locations?.length ? <>
      <Typography.Title level={5}>{t("mappedFrames")}</Typography.Title>
      {fault.locations.map((location,index) => <div key={index}>
        <Space wrap><Tag>{t(`mapping.${location.status}`)}</Tag><Typography.Text type="secondary">{t("mappingBuild")}: {location.build}</Typography.Text></Space>
        {location.original ? <pre className={styles.code}>{`${location.original.source}:${location.original.line}:${location.original.column}`}</pre> : null}
      </div>)}
    </> : null}
    <Typography.Title level={5}>{t("generatedFrames")}</Typography.Title>
    <pre className={styles.code}>{fault.error?.frames.join("\n") || fault.reference?.clientFrames.map((frame) => `${frame.asset}:${frame.line}:${frame.column}`).join("\n") || "—"}</pre>
    <Alert type={data.truncated ? "warning" : "info"} title={data.truncated ? t("truncated") : t("incomplete")} />
    <Typography.Title level={5}>{t("timeline")}</Typography.Title>
    <Timeline items={data.events.map((event,index) => ({
      key: event.id,
      color: event.kind === "fault" || event.outcome === "failure" ? "red" : event.outcome === "success" ? "green" : "gray",
      content: <div className={styles.stage}>
        <Space wrap><strong>{index+1}. {t(event.kind === "fault" ? "fault" : names[event.name] ?? "stage.app.operation")}</strong><Tag>{t(`outcome.${event.outcome}`)}</Tag>{event.durationMs !== null ? <span>{Math.round(event.durationMs)} ms</span> : null}</Space>
        <span className={styles.meta}>{date(event.at)} · {event.identity.role} · {event.identity.instance}</span>
        {event.taskId ? <span className={styles.meta}>{t("task")}: {event.taskId}</span> : null}
        {event.parentId ? <span className={styles.meta}>{t("parent")}: {data.events.some((parent) => parent.id === event.parentId) ? `#${data.events.findIndex((parent) => parent.id === event.parentId)+1}` : event.parentId}</span> : null}
      </div>,
    }))} />
  </Space>;
}
