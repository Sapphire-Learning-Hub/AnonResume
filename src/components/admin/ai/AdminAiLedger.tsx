"use client";

import { AdminAiSearch } from "@/components/admin/ai/AdminAiSearch";
import type { LedgerItem } from "@/components/admin/ai/types";
import { AdminIdentity, AdminPage, AdminSection, AdminTable } from "@/components/admin/AdminPage";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

export function AdminAiLedger({
  ledger,
  searchParams,
}: {
  ledger: PageResult<LedgerItem>;
  searchParams: PaginationSearchParams;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const formatNumber = (value: string | number | null) => Number(value ?? 0).toLocaleString(locale);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "-";
  const ledgerLabels: Record<string, string> = {
    renewal: t("ai.ledger.renewal"),
    adjustment: t("ai.ledger.adjustment"),
    reserve: t("ai.ledger.reserve"),
    settlement: t("ai.ledger.settlement"),
    release: t("ai.ledger.release"),
  };

  return (
    <AdminPage title={t("ai.ledger")}>
      <AdminAiSearch basePath="/app/manage/ai/ledger" placeholder={t("ai.search")} searchParams={searchParams} />
      <AdminSection>
        <AdminTable
          headers={[t("ai.ledgerEntry"), t("ai.user"), t("ai.resume"), t("ai.model"), t("ai.ledgerType"), t("ai.tokens"), t("ai.points"), t("ai.createdAt")]}
          pagination={{
            basePath: "/app/manage/ai/ledger",
            page: ledger.page,
            pageSize: ledger.pageSize,
            searchParams,
            total: ledger.total,
            totalPages: ledger.totalPages,
          }}
          rows={ledger.items.map((item) => [
            <AdminIdentity key="entry" title={item.ledgerId} description={item.runId ?? "-"} />,
            <AdminIdentity key="user" title={item.userName} description={`${item.email} · ${item.userId}`} />,
            item.resumeName ? <AdminIdentity key="resume" title={item.resumeName} description={item.resumeId} /> : "-",
            item.modelName ? <AdminIdentity key="model" title={item.modelName} description={item.modelId} /> : "-",
            ledgerLabels[item.entryType] ?? item.entryType,
            <span key="tokens">{formatNumber(item.inputTokens)} / {formatNumber(item.cachedInputTokens)} / {formatNumber(item.outputTokens)}</span>,
            formatNumber(item.pointsDelta),
            formatDate(item.createdAt),
          ])}
        />
      </AdminSection>
    </AdminPage>
  );
}
