"use client";

import { Button, Checkbox, Input, InputNumber, Modal, Switch } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import {
  AdminIdentity,
  AdminPage,
  AdminSection,
  AdminStatus,
  AdminTable,
  AdminTableActions,
  AdminToolbar,
} from "@/components/admin/AdminPage";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

interface ProviderItem {
  providerId: string;
  providerName: string;
  baseUrl: string;
  providerEnabled: boolean;
  modelId: string;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPointRate: string;
  cachedInputPointRate: string;
  outputPointRate: string;
  rateCardVersion: number;
}

interface QuotaItem {
  userId: string;
  userName: string;
  email: string;
  monthlyLimit: string;
  customLimit: boolean;
  usedPoints: string;
  reservedPoints: string;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
}

interface UsageItem {
  runId: string;
  userId: string;
  userName: string;
  email: string;
  resumeId: string;
  resumeName: string;
  modelId: string;
  modelName: string;
  keySource: string;
  status: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reservedPoints: string;
  finalPoints: string | null;
  hasEvidence: boolean;
  createdAt: string;
  completedAt: string | null;
}

interface LedgerItem {
  ledgerId: string;
  runId: string | null;
  userId: string;
  userName: string;
  email: string;
  resumeId: string | null;
  resumeName: string | null;
  modelId: string | null;
  modelName: string | null;
  entryType: string;
  pointsDelta: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

interface ProviderDraft {
  providerId?: string;
  modelId?: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  providerEnabled: boolean;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPointRate: number;
  cachedInputPointRate: number;
  outputPointRate: number;
}

const EMPTY_PROVIDER: ProviderDraft = {
  providerName: "",
  baseUrl: "https://",
  apiKey: "",
  providerEnabled: true,
  modelKey: "",
  modelName: "",
  modelEnabled: true,
  supportsToolCalls: true,
  contextWindow: 128_000,
  maxOutputTokens: 4_096,
  inputPointRate: 0,
  cachedInputPointRate: 0,
  outputPointRate: 0,
};

const evidenceSchema = z.object({
  runId: z.string(),
  request: z.unknown(),
  response: z.unknown(),
  payloadHash: z.string(),
  expiresAt: z.string(),
});

function asNumber(value: number | null, fallback = 0) {
  return value ?? fallback;
}

export function AdminAiManager({
  canManageProviders,
  canManageQuotas,
  canReadSensitive,
  defaultMonthlyPoints,
  ledger,
  providers,
  quotas,
  searchParams,
  title,
  usage,
}: {
  canManageProviders: boolean;
  canManageQuotas: boolean;
  canReadSensitive: boolean;
  defaultMonthlyPoints: number;
  ledger: PageResult<LedgerItem> | null;
  providers: PageResult<ProviderItem> | null;
  quotas: PageResult<QuotaItem> | null;
  searchParams: PaginationSearchParams;
  title: string;
  usage: PageResult<UsageItem> | null;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [pending, setPending] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>();
  const [quotaDraft, setQuotaDraft] = useState<QuotaItem>();
  const [quotaLimit, setQuotaLimit] = useState(0);
  const [evidence, setEvidence] = useState<{
    runId: string;
    request: unknown;
    response: unknown;
    payloadHash: string;
    expiresAt: string;
  }>();
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmText: string;
    action: () => Promise<void>;
  }>();
  const [deferredAction, setDeferredAction] = useState<(() => Promise<void>)>();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");

  const formatNumber = (value: string | number | null) =>
    Number(value ?? 0).toLocaleString(locale);
  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

  const statusLabels: Record<string, string> = {
    preparing: t("ai.status.preparing"),
    streaming: t("ai.status.streaming"),
    complete: t("ai.status.complete"),
    stopped: t("ai.status.stopped"),
    failed: t("ai.status.failed"),
    interrupted: t("ai.status.interrupted"),
    settlement_pending: t("ai.status.settlementPending"),
  };
  const ledgerLabels: Record<string, string> = {
    renewal: t("ai.ledger.renewal"),
    adjustment: t("ai.ledger.adjustment"),
    reserve: t("ai.ledger.reserve"),
    settlement: t("ai.ledger.settlement"),
    release: t("ai.ledger.release"),
  };

  function submitSearch(value: string) {
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    params.set("providerPage", "1");
    params.set("quotaPage", "1");
    params.set("usagePage", "1");
    params.set("ledgerPage", "1");
    router.push(`/app/manage/ai?${params.toString()}`);
  }

  async function runSensitive(action: () => Promise<Response>) {
    setPending(true);
    const response = await action();
    setPending(false);
    if (response.status === 428) {
      setDeferredAction(() => async () => {
        await runSensitive(action);
      });
      setReauthOpen(true);
      return null;
    }
    if (!response.ok) {
      toast.error(t("ai.failed"));
      return null;
    }
    return response;
  }

  async function reauthenticate() {
    setPending(true);
    const response = await fetch("/api/manage/session/reauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: reauthCode }),
    });
    setPending(false);
    if (!response.ok) {
      toast.error(t("common.invalidCode"));
      return;
    }
    const action = deferredAction;
    setDeferredAction(undefined);
    setReauthOpen(false);
    setReauthCode("");
    if (action) await action();
  }

  function editProvider(item?: ProviderItem) {
    setProviderDraft(item ? {
      providerId: item.providerId,
      modelId: item.modelId,
      providerName: item.providerName,
      baseUrl: item.baseUrl,
      apiKey: "",
      providerEnabled: item.providerEnabled,
      modelKey: item.modelKey,
      modelName: item.modelName,
      modelEnabled: item.modelEnabled,
      supportsToolCalls: item.supportsToolCalls,
      contextWindow: item.contextWindow,
      maxOutputTokens: item.maxOutputTokens,
      inputPointRate: Number(item.inputPointRate),
      cachedInputPointRate: Number(item.cachedInputPointRate),
      outputPointRate: Number(item.outputPointRate),
    } : { ...EMPTY_PROVIDER });
  }

  async function saveProvider() {
    const draft = providerDraft;
    if (!draft) return;
    const response = await runSensitive(() => fetch(
      draft.providerId
        ? `/api/manage/ai/providers/${encodeURIComponent(draft.providerId)}`
        : "/api/manage/ai/providers",
      {
        method: draft.providerId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: draft.providerName,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey || undefined,
          enabled: draft.providerEnabled,
          model: {
            id: draft.modelId,
            providerModelKey: draft.modelKey,
            displayName: draft.modelName,
            enabled: draft.modelEnabled,
            supportsToolCalls: draft.supportsToolCalls,
            contextWindow: draft.contextWindow,
            maxOutputTokens: draft.maxOutputTokens,
            inputPointRate: draft.inputPointRate,
            cachedInputPointRate: draft.cachedInputPointRate,
            outputPointRate: draft.outputPointRate,
          },
        }),
      },
    ));
    if (!response) return;
    setProviderDraft(undefined);
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function disableProvider(item: ProviderItem) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(item.providerId)}`,
      { method: "DELETE" },
    ));
    if (!response) return;
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function saveQuota() {
    if (!quotaDraft) return;
    const response = await runSensitive(() => fetch("/api/manage/ai/quotas", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: quotaDraft.userId, monthlyLimit: quotaLimit }),
    }));
    if (!response) return;
    setQuotaDraft(undefined);
    toast.success(t("ai.updated"));
    router.refresh();
  }

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
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/audit/${encodeURIComponent(item.runId)}`,
    ));
    if (!response) return;
    const parsed = evidenceSchema.safeParse(await response.json());
    if (!parsed.success) {
      toast.error(t("ai.failed"));
      return;
    }
    setEvidence(parsed.data);
  }

  return (
    <AdminPage title={title}>
      <AdminToolbar>
        <Input.Search
          allowClear
          defaultValue={typeof searchParams.q === "string" ? searchParams.q : ""}
          onSearch={submitSearch}
          placeholder={t("ai.search")}
        />
      </AdminToolbar>
      {providers ? (
        <AdminSection
          actions={canManageProviders ? <Button onClick={() => editProvider()} type="primary">{t("ai.addProvider")}</Button> : undefined}
          title={t("ai.providers")}
        >
          <p className="admin-section-description">{t("ai.providersDescription")}</p>
          <AdminTable
            actionColumn
            headers={[t("ai.provider"), t("ai.model"), t("ai.points"), t("ai.status"), t("common.actions")]}
            pagination={{
              basePath: "/app/manage/ai",
              page: providers.page,
              pageParam: "providerPage",
              pageSize: providers.pageSize,
              searchParams,
              total: providers.total,
              totalPages: providers.totalPages,
            }}
            rows={providers.items.map((item) => [
              <AdminIdentity key="provider" title={item.providerName} description={`${item.baseUrl} · ${item.providerId}`} />,
              <AdminIdentity key="model" title={item.modelName} description={`${item.modelKey} · ${item.modelId}`} />,
              <span key="rates">{item.inputPointRate} / {item.cachedInputPointRate} / {item.outputPointRate} · v{item.rateCardVersion}</span>,
              <AdminStatus key="status" tone={item.providerEnabled && item.modelEnabled ? "success" : "default"}>{item.providerEnabled && item.modelEnabled ? t("ai.enabled") : t("ai.disabled")}</AdminStatus>,
              <AdminTableActions key="actions">
                <Button onClick={() => editProvider(item)} type="link">{t("common.edit")}</Button>
                {item.providerEnabled ? <Button danger onClick={() => setConfirmation({
                  title: t("ai.confirmDisableTitle"),
                  description: t("ai.confirmDisableDescription"),
                  confirmText: t("ai.confirmDisable"),
                  action: () => disableProvider(item),
                })} type="link">{t("ai.disableProvider")}</Button> : null}
              </AdminTableActions>,
            ])}
          />
        </AdminSection>
      ) : null}

      {quotas ? (
        <AdminSection title={t("ai.quotas")}>
          <p className="admin-section-description">{t("ai.defaultQuota", { points: formatNumber(defaultMonthlyPoints) })}</p>
          <AdminTable
            actionColumn
            headers={[t("ai.user"), t("ai.monthlyLimit"), t("ai.usedPoints"), t("ai.reservedPoints"), t("ai.period"), t("common.actions")]}
            pagination={{
              basePath: "/app/manage/ai",
              page: quotas.page,
              pageParam: "quotaPage",
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
              <AdminTableActions key="actions"><Button onClick={() => {
                setQuotaDraft(item);
                setQuotaLimit(Number(item.monthlyLimit));
              }} type="link">{t("ai.editQuota")}</Button></AdminTableActions>,
            ])}
          />
        </AdminSection>
      ) : null}

      {usage ? (
        <AdminSection title={t("ai.usage")}>
          <AdminTable
            actionColumn
            headers={[t("ai.run"), t("ai.user"), t("ai.resume"), t("ai.model"), t("ai.status"), t("ai.tokens"), t("ai.points"), t("common.actions")]}
            pagination={{
              basePath: "/app/manage/ai",
              page: usage.page,
              pageParam: "usagePage",
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
      ) : null}

      {ledger ? (
        <AdminSection title={t("ai.ledger")}>
          <AdminTable
            headers={[t("ai.ledgerEntry"), t("ai.user"), t("ai.resume"), t("ai.model"), t("ai.ledgerType"), t("ai.tokens"), t("ai.points"), t("ai.createdAt")]}
            pagination={{
              basePath: "/app/manage/ai",
              page: ledger.page,
              pageParam: "ledgerPage",
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
      ) : null}

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: pending }}
        okText={t("common.confirm")}
        onCancel={() => setProviderDraft(undefined)}
        onOk={() => void saveProvider()}
        open={Boolean(providerDraft) && !reauthOpen}
        title={providerDraft?.providerId ? t("ai.editProvider") : t("ai.addProvider")}
        width={720}
      >
        {providerDraft ? (
          <div className="admin-dialog-form">
            <Input onChange={(event) => setProviderDraft({ ...providerDraft, providerName: event.target.value })} placeholder={t("ai.provider")} value={providerDraft.providerName} />
            <Input onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.target.value })} placeholder={t("ai.endpoint")} value={providerDraft.baseUrl} />
            <Input.Password onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.target.value })} placeholder={providerDraft.providerId ? t("ai.apiKeyPlaceholder") : t("ai.apiKey")} value={providerDraft.apiKey} />
            <Input onChange={(event) => setProviderDraft({ ...providerDraft, modelName: event.target.value })} placeholder={t("ai.model")} value={providerDraft.modelName} />
            <Input onChange={(event) => setProviderDraft({ ...providerDraft, modelKey: event.target.value })} placeholder={t("ai.modelKey")} value={providerDraft.modelKey} />
            <InputNumber min={1} onChange={(value) => setProviderDraft({ ...providerDraft, contextWindow: asNumber(value, 1) })} placeholder={t("ai.contextWindow")} value={providerDraft.contextWindow} />
            <InputNumber min={1} onChange={(value) => setProviderDraft({ ...providerDraft, maxOutputTokens: asNumber(value, 1) })} placeholder={t("ai.maxOutputTokens")} value={providerDraft.maxOutputTokens} />
            <InputNumber min={0} onChange={(value) => setProviderDraft({ ...providerDraft, inputPointRate: asNumber(value) })} placeholder={t("ai.inputRate")} value={providerDraft.inputPointRate} />
            <InputNumber min={0} onChange={(value) => setProviderDraft({ ...providerDraft, cachedInputPointRate: asNumber(value) })} placeholder={t("ai.cachedInputRate")} value={providerDraft.cachedInputPointRate} />
            <InputNumber min={0} onChange={(value) => setProviderDraft({ ...providerDraft, outputPointRate: asNumber(value) })} placeholder={t("ai.outputRate")} value={providerDraft.outputPointRate} />
            <Checkbox checked={providerDraft.supportsToolCalls} onChange={(event) => setProviderDraft({ ...providerDraft, supportsToolCalls: event.target.checked })}>{t("ai.supportsToolCalls")}</Checkbox>
            <label>{t("ai.enabled")} <Switch checked={providerDraft.providerEnabled && providerDraft.modelEnabled} onChange={(checked) => setProviderDraft({ ...providerDraft, providerEnabled: checked, modelEnabled: checked })} /></label>
          </div>
        ) : null}
      </Modal>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: pending }}
        okText={t("common.confirm")}
        onCancel={() => setQuotaDraft(undefined)}
        onOk={() => void saveQuota()}
        open={Boolean(quotaDraft) && !reauthOpen}
        title={t("ai.editQuota")}
      >
        {quotaDraft ? <div className="admin-dialog-form">
          <AdminIdentity title={quotaDraft.userName} description={`${quotaDraft.email} · ${quotaDraft.userId}`} />
          <InputNumber min={0} onChange={(value) => setQuotaLimit(asNumber(value))} value={quotaLimit} />
        </div> : null}
      </Modal>

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

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verifyContinue")}
        onCancel={() => setReauthOpen(false)}
        onOk={() => void reauthenticate()}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">{t("common.reauthDescription")}</p>
          <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
        </div>
      </Modal>
    </AdminPage>
  );
}
