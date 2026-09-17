"use client";

import { Button, DatePicker, Form, InputNumber, Modal, Tag } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminAiSearch } from "@/components/admin/ai/AdminAiSearch";
import type { QuotaItem } from "@/components/admin/ai/types";
import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";
import {
  AdminIdentity,
  AdminPage,
  AdminSection,
  AdminTable,
  AdminTableActions,
} from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

function asNumber(value: number | null) {
  return value ?? 0;
}

export function AdminAiQuotas({
  defaultMonthlyPoints,
  quotas,
  searchParams,
}: {
  defaultMonthlyPoints: number;
  quotas: PageResult<QuotaItem>;
  searchParams: PaginationSearchParams;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const { pending, reauthModal, reauthOpen, runSensitive } = useAdminAiSensitiveAction();
  const [quotaDraft, setQuotaDraft] = useState<QuotaItem>();
  const [quotaLimit, setQuotaLimit] = useState(0);
  const [quotaPeriod, setQuotaPeriod] = useState<[Dayjs, Dayjs]>();
  const formatNumber = (value: string | number | null) => Number(value ?? 0).toLocaleString(locale);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "-";

  async function saveQuota() {
    if (!quotaDraft) return;
    if (!quotaPeriod || !quotaPeriod[1].isAfter(quotaPeriod[0])) {
      toast.error(t("ai.invalidQuotaPeriod"));
      return;
    }
    const response = await runSensitive(() => fetch("/api/manage/ai/quotas", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: quotaDraft.userId,
        monthlyLimit: quotaLimit,
        periodStartedAt: quotaPeriod[0].toISOString(),
        periodEndsAt: quotaPeriod[1].toISOString(),
      }),
    }));
    if (!response) return;
    setQuotaDraft(undefined);
    toast.success(t("ai.updated"));
    router.refresh();
  }

  return (
    <AdminPage
      actions={(
        <Tag variant="filled">
          {t("ai.defaultQuota", { points: formatNumber(defaultMonthlyPoints) })}
        </Tag>
      )}
      title={t("ai.quotas")}
    >
      <AdminAiSearch basePath="/app/manage/ai/quotas" placeholder={t("ai.search")} searchParams={searchParams} />
      <AdminSection>
        <AdminTable
          actionColumn
          headers={[t("ai.user"), t("ai.monthlyLimit"), t("ai.usedPoints"), t("ai.reservedPoints"), t("ai.period"), t("common.actions")]}
          pagination={{
            basePath: "/app/manage/ai/quotas",
            page: quotas.page,
            pageSize: quotas.pageSize,
            searchParams,
            total: quotas.total,
            totalPages: quotas.totalPages,
          }}
          rows={quotas.items.map((item) => [
            <AdminIdentity key="user" title={item.userName} description={`${item.email} · ${item.userId}`} />,
            <span key="limit">{formatNumber(item.monthlyLimit)}{item.customLimit ? ` · ${t("ai.customQuota")}` : ""}</span>,
            formatNumber(item.usedPoints),
            formatNumber(item.reservedPoints),
            <span key="period">{formatDate(item.periodStartedAt)} – {formatDate(item.periodEndsAt)}</span>,
            <AdminTableActions key="actions">
              <Button onClick={() => {
                const periodStartedAt = item.periodStartedAt
                  ? dayjs(item.periodStartedAt)
                  : dayjs();
                setQuotaDraft(item);
                setQuotaLimit(Number(item.monthlyLimit));
                setQuotaPeriod([
                  periodStartedAt,
                  item.periodEndsAt
                    ? dayjs(item.periodEndsAt)
                    : periodStartedAt.add(1, "month"),
                ]);
              }} type="link">{t("ai.editQuota")}</Button>
            </AdminTableActions>,
          ])}
        />
      </AdminSection>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: pending }}
        okText={t("common.confirm")}
        onCancel={() => {
          setQuotaDraft(undefined);
          setQuotaPeriod(undefined);
        }}
        onOk={() => void saveQuota()}
        open={Boolean(quotaDraft) && !reauthOpen}
        title={t("ai.editQuota")}
        width={620}
      >
        {quotaDraft ? <Form className="admin-dialog-form" layout="vertical">
          <AdminIdentity title={quotaDraft.userName} description={`${quotaDraft.email} · ${quotaDraft.userId}`} />
          <div className="admin-quota-summary">
            <span>{t("ai.usedPoints")}：{formatNumber(quotaDraft.usedPoints)}</span>
            <span>{t("ai.reservedPoints")}：{formatNumber(quotaDraft.reservedPoints)}</span>
          </div>
          <Form.Item
            extra={t("ai.quotaLimitDescription")}
            htmlFor="quota-monthly-limit"
            label={t("ai.monthlyLimit")}
          >
            <InputNumber
              id="quota-monthly-limit"
              min={0}
              onChange={(value) => setQuotaLimit(asNumber(value))}
              value={quotaLimit}
            />
            <Button onClick={() => setQuotaLimit(defaultMonthlyPoints)} type="link">
              {t("ai.restoreDefaultQuota")}
            </Button>
          </Form.Item>
          <Form.Item
            extra={t("ai.quotaPeriodDescription")}
            label={t("ai.period")}
          >
            <DatePicker.RangePicker
              allowClear={false}
              onChange={(value) => {
                if (value?.[0] && value[1]) {
                  setQuotaPeriod([value[0], value[1]]);
                }
              }}
              showTime
              value={quotaPeriod}
            />
          </Form.Item>
        </Form> : null}
      </Modal>
      {reauthModal}
    </AdminPage>
  );
}
