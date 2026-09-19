"use client";

import { Button, Input, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { AdminAiSearch } from "@/components/admin/ai/AdminAiSearch";
import type { UsageItem } from "@/components/admin/ai/types";
import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";
import {
  AdminIdentity,
  AdminPage,
  AdminSection,
  AdminStatus,
  AdminTable,
  AdminTableActions,
} from "@/components/admin/AdminPage";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

const evidenceSchema = z.object({
  runId: z.string(),
  request: z.unknown(),
  response: z.unknown(),
  payloadHash: z.string(),
  expiresAt: z.string(),
});

export function AdminAiUsage({
  canManageQuotas,
  canReadSensitive,
  searchParams,
  usage,
}: {
  canManageQuotas: boolean;
  canReadSensitive: boolean;
  searchParams: PaginationSearchParams;
  usage: PageResult<UsageItem>;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const { pending, reauthModal, runSensitive } = useAdminAiSensitiveAction();
  const [evidence, setEvidence] = useState<z.infer<typeof evidenceSchema>>();
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmText: string;
    action: () => Promise<void>;
  }>();
  const formatNumber = (value: string | number | null) => Number(value ?? 0).toLocaleString(locale);
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "-";
  const statusLabels: Record<string, string> = {
    queued: t("ai.status.queued"),
    preparing: t("ai.status.preparing"),
    streaming: t("ai.status.streaming"),
    complete: t("ai.status.complete"),
    stopped: t("ai.status.stopped"),
    failed: t("ai.status.failed"),
    interrupted: t("ai.status.interrupted"),
    settlement_pending: t("ai.status.settlementPending"),
  };

  async function settleRun(item: UsageItem, decision: "charge_reserved" | "release") {
    const response = await runSensitive(() => fetch("/api/manage/ai/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: item.runId, decision }),
    }));
    if (!response) return;
    toast.success(t("ai.settled"));
    router.refresh();
  }

  async function readEvidence(item: UsageItem) {
    const response = await runSensitive(() => fetch(`/api/manage/ai/audit/${encodeURIComponent(item.runId)}`));
    if (!response) return;
    const parsed = evidenceSchema.safeParse(await response.json());
    if (!parsed.success) {
      toast.error(t("ai.failed"));
      return;
    }
    setEvidence(parsed.data);
  }

  return (
    <AdminPage title={t("ai.usage")}>
      <AdminAiSearch basePath="/app/manage/ai/usage" placeholder={t("ai.search")} searchParams={searchParams} />
      <AdminSection>
        <AdminTable
          actionColumn
          headers={[t("ai.run"), t("ai.user"), t("ai.resume"), t("ai.model"), t("ai.status"), t("ai.tokens"), t("ai.points"), t("common.actions")]}
          pagination={{
            basePath: "/app/manage/ai/usage",
            page: usage.page,
            pageSize: usage.pageSize,
            searchParams,
            total: usage.total,
            totalPages: usage.totalPages,
          }}
          rows={usage.items.map((item) => [
            <AdminIdentity key="run" title={item.runId} description={formatDate(item.createdAt)} />,
            <AdminIdentity key="user" title={item.userName} description={`${item.email} · ${item.userId}`} />,
            <AdminIdentity key="resume" title={item.resumeName} description={item.resumeId} />,
            <AdminIdentity key="model" title={item.modelName} description={item.modelId} />,
            <AdminStatus key="status" tone={item.status === "complete" ? "success" : item.status === "settlement_pending" ? "warning" : "default"}>{statusLabels[item.status] ?? item.status}</AdminStatus>,
            <span key="tokens">{formatNumber(item.inputTokens)} / {formatNumber(item.cachedInputTokens)} / {formatNumber(item.outputTokens)}</span>,
            <span key="points">{formatNumber(item.finalPoints ?? item.reservedPoints)}</span>,
            <AdminTableActions key="actions">
              {canReadSensitive && item.hasEvidence ? <Button onClick={() => void readEvidence(item)} type="link">{t("ai.viewEvidence")}</Button> : null}
              {canManageQuotas && item.status === "settlement_pending" ? (
                <>
                  <Button onClick={() => setConfirmation({
                    title: t("ai.settlementPending"),
                    description: t("ai.chargeReserved"),
                    confirmText: t("common.confirm"),
                    action: () => settleRun(item, "charge_reserved"),
                  })} type="link">{t("ai.chargeReserved")}</Button>
                  <Button danger onClick={() => setConfirmation({
                    title: t("ai.settlementPending"),
                    description: t("ai.releaseReserved"),
                    confirmText: t("common.confirm"),
                    action: () => settleRun(item, "release"),
                  })} type="link">{t("ai.releaseReserved")}</Button>
                </>
              ) : null}
            </AdminTableActions>,
          ])}
        />
      </AdminSection>

      <Modal footer={null} onCancel={() => setEvidence(undefined)} open={Boolean(evidence)} title={t("ai.evidenceTitle")} width={800}>
        {evidence ? <div className="admin-dialog-form">
          <AdminIdentity title={evidence.runId} description={`${t("ai.payloadHash")}: ${evidence.payloadHash}`} />
          <strong>{t("ai.request")}</strong>
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} readOnly value={JSON.stringify(evidence.request, null, 2)} />
          <strong>{t("ai.response")}</strong>
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} readOnly value={JSON.stringify(evidence.response, null, 2)} />
          <span>{t("ai.expiresAt")}: {formatDate(evidence.expiresAt)}</span>
        </div> : null}
      </Modal>

      <ActionConfirmationModal
        cancelText={t("common.cancel")}
        confirmText={confirmation?.confirmText ?? ""}
        description={confirmation?.description ?? ""}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={() => {
          const action = confirmation?.action;
          setConfirmation(undefined);
          if (action) void action();
        }}
        open={Boolean(confirmation)}
        pending={pending}
        title={confirmation?.title ?? ""}
      />
      {reauthModal}
    </AdminPage>
  );
}
