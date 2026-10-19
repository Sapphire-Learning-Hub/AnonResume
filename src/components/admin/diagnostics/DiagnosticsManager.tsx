"use client";

import { useState } from "react";
import { Alert, Button, Empty, Input, Modal, Result, Select, Spin, Table, Typography } from "antd";
import { AdminSection, AdminToolbar } from "@/components/admin/AdminPage";
import type { AppLocale } from "@/i18n/messages";
import { createDiagnosticTranslator } from "@/i18n/diagnostics-messages";
import { diagnosticCategorySchema, diagnosticDetailsSchema, diagnosticFilterSchema, diagnosticListSchema, diagnosticSourceSchema } from "@/lib/observability/diagnostics/store/schema";
import { DiagnosticDetails } from "./DiagnosticDetails";
import { useDiagnosticStyles } from "./styles";
import { useDiagnosticResource } from "./useDiagnosticResource";

export function DiagnosticsManager({ locale }: { locale: AppLocale }) {
  const t = createDiagnosticTranslator(locale);
  const { styles } = useDiagnosticStyles();
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState({ q: "", source: "", category: "", role: "", instance: "", build: "", days: "7" });
  const [invalid,setInvalid] = useState(false);
  const [cursors,setCursors] = useState<string[]>([]);
  const [refresh,setRefresh] = useState(0);
  const [selected,setSelected] = useState<string>();
  const [detailRefresh,setDetailRefresh] = useState(0);
  const params = new URLSearchParams(Object.entries(filter).filter(([,value]) => value));
  if (cursors.length) params.set("cursor",cursors.at(-1)!);
  const { data,status:failed,loading } = useDiagnosticResource(`/api/manage/diagnostics?${params}`,refresh,diagnosticListSchema);
  const { data:detail,status:detailFailed,loading:detailLoading } = useDiagnosticResource(selected ? `/api/manage/diagnostics/${selected}` : undefined,detailRefresh,diagnosticDetailsSchema);
  const detailMissing = detailFailed === 404;
  const update = (key: keyof typeof filter, value: string) => { setCursors([]); setFilter((current) => ({ ...current,[key]: value })); };
  const submit = () => {
    const valid = diagnosticFilterSchema.shape.q.safeParse(query.trim());
    setInvalid(!valid.success);
    if (valid.success) update("q",valid.data);
  };
  return <AdminSection>
    <AdminToolbar>
      <div className={styles.filters}>
        <Input.Search className={styles.search} placeholder={t("search")} value={query} onChange={(event) => setQuery(event.target.value)} onSearch={submit} status={invalid ? "error" : undefined} aria-label={t("search")} enterButton={t("query")} />
        <Select className={styles.filter} aria-label={t("source")} value={filter.source} onChange={(value) => update("source",value)} options={[{value:"",label:t("allSources")},...diagnosticSourceSchema.options.map((value) => ({value,label:t(`source.${value}`)}))]} />
        <Select className={styles.filter} aria-label={t("category")} value={filter.category} onChange={(value) => update("category",value)} options={[{value:"",label:t("allCategories")},...diagnosticCategorySchema.options.map((value) => ({value,label:t(`category.${value}`)}))]} />
        <Select className={styles.filter} aria-label={t("role")} value={filter.role} onChange={(value) => update("role",value)} options={[{value:"",label:t("allRoles")},...(["web","ai-worker","pdf-worker"] as const).map((value) => ({value,label:value}))]} />
        <Select aria-label={t("days")} value={filter.days} onChange={(value) => update("days",value)} options={[1,7,30].map((value) => ({value:String(value),label:`${t("days")}: ${value}`}))} />
        <Input className={styles.filter} aria-label={t("instance")} placeholder={t("instance")} maxLength={256} value={filter.instance} onChange={(event) => update("instance",event.target.value)} />
        <Input className={styles.filter} aria-label={t("build")} placeholder={t("build")} maxLength={128} value={filter.build} onChange={(event) => update("build",event.target.value)} />
        <Button onClick={() => setRefresh((value) => value+1)}>{t("refresh")}</Button>
      </div>
    </AdminToolbar>
    {invalid ? <Typography.Text type="danger">{t("invalid")}</Typography.Text> : null}
    <div className={styles.notes}>
      {data && !data.enabled ? <Alert type="warning" title={t("disabled")} /> : null}
      {data && (data.localHealth.degraded || data.localHealth.dropped>0) ? <Alert type="warning" title={t("degraded")} /> : null}
      <Typography.Text type="secondary">{t("retention")}</Typography.Text>
    </div>
    {failed ? <Result status="error" title={t(failed === 401 ? "reauthenticate" : failed === 403 ? "forbidden" : "failed")} extra={failed === 401 ? <Button href="/app/manage">{t("enterManagement")}</Button> : <Button onClick={() => setRefresh((value) => value+1)}>{t("retry")}</Button>} /> :
      <Table rowKey="id" loading={loading} dataSource={data?.items ?? []} pagination={false} scroll={{x:1000}} locale={{emptyText:<Empty description={t("empty")} />}} columns={[
        {title:t("time"),dataIndex:"at",render:(value:string) => new Date(value).toLocaleString(locale)},
        {title:t("source"),render:(_,row) => t(`source.${row.source}`)},
        {title:t("reason"),render:(_,row) => row.error ? t(`category.${row.error.category}`) : "—"},
        {title:t("instance"),render:(_,row) => <>{row.identity.role}<br />{row.identity.instance}</>},
        {title:t("count"),dataIndex:"occurrences"},
        {title:t("first"),render:(_,row) => new Date(row.firstSeen).toLocaleString(locale)},
        {title:t("last"),render:(_,row) => new Date(row.lastSeen).toLocaleString(locale)},
        {title:t("identifier"),render:(_,row) => <Typography.Text copyable>{row.diagnosticId}</Typography.Text>},
        {title:t("detail"),render:(_,row) => <Button type="link" onClick={() => setSelected(row.id)}>{t("detail")}</Button>},
      ]} />}
    <div className={styles.pagination}>
      <Button disabled={!cursors.length || loading} onClick={() => setCursors((value) => value.slice(0,-1))}>{t("previous")}</Button>
      <Button disabled={!data?.nextCursor || loading} onClick={() => { if (data?.nextCursor) setCursors((value) => [...value,data.nextCursor!]); }}>{t("next")}</Button>
    </div>
    <Modal title={t("title")} open={Boolean(selected)} onCancel={() => setSelected(undefined)} footer={null} width={960}>
      {detailLoading ? <Spin tip={t("loading")}><div style={{minHeight:160}} /></Spin> : detailFailed || detailMissing ? <Result status={detailMissing ? "404" : "error"} title={t(detailMissing ? "missing" : "detailFailed")} extra={<Button onClick={() => setDetailRefresh((value) => value+1)}>{t("retry")}</Button>} /> : detail ? <DiagnosticDetails data={detail} locale={locale} /> : null}
    </Modal>
  </AdminSection>;
}
