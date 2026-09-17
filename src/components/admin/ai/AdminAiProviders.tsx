"use client";

import { ExclamationCircleFilled, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  theme,
  Tooltip,
} from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminAiSearch } from "@/components/admin/ai/AdminAiSearch";
import type {
  ProviderItem,
  ProviderModelItem,
} from "@/components/admin/ai/types";
import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";
import {
  AdminPage,
  AdminSection,
} from "@/components/admin/AdminPage";
import {
  AiModelEmpty,
  AiModelRow,
  AiModelTable,
  AiProviderCard,
  AiProviderList,
} from "@/components/ai/model-management/AiProviderCatalog";
import { NumberedPagination } from "@/components/common/NumberedPagination";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fetchAiAdminModelRateVersions,
  type AiAdminModelRateHistory,
  type AiAdminModelRateVersion,
} from "@/lib/ai/admin/client";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

interface ProviderDraft {
  providerId?: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  providerEnabled: boolean;
}

interface ModelDraft {
  providerId: string;
  providerName: string;
  providerEnabled: boolean;
  modelId?: string;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  freeModel: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPointRate: number;
  cachedInputPointRate: number;
  outputPointRate: number;
}

interface RateHistoryState {
  modelId: string;
  modelName: string;
  loading: boolean;
  data?: AiAdminModelRateHistory;
}

const EMPTY_PROVIDER: ProviderDraft = {
  providerName: "",
  baseUrl: "https://",
  apiKey: "",
  providerEnabled: true,
};

function asNumber(value: number | null, fallback = 0) {
  return value ?? fallback;
}

function isFreeModel(model: ProviderModelItem) {
  return [
    model.inputPointRate,
    model.cachedInputPointRate,
    model.outputPointRate,
  ].every((rate) => Number(rate) === 0);
}

function createModelDraft(
  provider: ProviderItem,
  model?: ProviderModelItem,
): ModelDraft {
  return model ? {
    providerId: provider.providerId,
    providerName: provider.providerName,
    providerEnabled: provider.providerEnabled,
    modelId: model.modelId,
    modelKey: model.modelKey,
    modelName: model.modelName,
    modelEnabled: model.modelEnabled,
    freeModel: isFreeModel(model),
    supportsToolCalls: model.supportsToolCalls,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    inputPointRate: Number(model.inputPointRate),
    cachedInputPointRate: Number(model.cachedInputPointRate),
    outputPointRate: Number(model.outputPointRate),
  } : {
    providerId: provider.providerId,
    providerName: provider.providerName,
    providerEnabled: provider.providerEnabled,
    modelKey: "",
    modelName: "",
    modelEnabled: provider.providerEnabled,
    freeModel: false,
    supportsToolCalls: true,
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputPointRate: 0,
    cachedInputPointRate: 0,
    outputPointRate: 0,
  };
}

export function AdminAiProviders({
  providers,
  searchParams,
}: {
  providers: PageResult<ProviderItem>;
  searchParams: PaginationSearchParams;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const { token } = theme.useToken();
  const router = useRouter();
  const { toast } = useAppFeedback();
  const { pending, reauthModal, reauthOpen, runSensitive } = useAdminAiSensitiveAction();
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>();
  const [modelDraft, setModelDraft] = useState<ModelDraft>();
  const [rateHistory, setRateHistory] = useState<RateHistoryState>();
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmText: string;
    action: () => Promise<void>;
  }>();

  function editProvider(item?: ProviderItem) {
    setProviderDraft(item ? {
      providerId: item.providerId,
      providerName: item.providerName,
      baseUrl: item.baseUrl,
      apiKey: "",
      providerEnabled: item.providerEnabled,
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
        }),
      },
    ));
    if (!response) return;
    setProviderDraft(undefined);
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function saveModel() {
    const draft = modelDraft;
    if (!draft) return;
    if (
      !draft.freeModel &&
      draft.inputPointRate === 0 &&
      draft.cachedInputPointRate === 0 &&
      draft.outputPointRate === 0
    ) {
      toast.error(t("ai.meteredRateRequired"));
      return;
    }
    const basePath = `/api/manage/ai/providers/${encodeURIComponent(draft.providerId)}/models`;
    const response = await runSensitive(() => fetch(
      draft.modelId ? `${basePath}/${encodeURIComponent(draft.modelId)}` : basePath,
      {
        method: draft.modelId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerModelKey: draft.modelKey,
          displayName: draft.modelName,
          enabled: draft.modelEnabled,
          supportsToolCalls: draft.supportsToolCalls,
          freeModel: draft.freeModel,
          contextWindow: draft.contextWindow,
          maxOutputTokens: draft.maxOutputTokens,
          inputPointRate: draft.inputPointRate,
          cachedInputPointRate: draft.cachedInputPointRate,
          outputPointRate: draft.outputPointRate,
        }),
      },
    ));
    if (!response) return;
    setModelDraft(undefined);
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function updateProviderEnabled(item: ProviderItem, enabled: boolean) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(item.providerId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: item.providerName,
          baseUrl: item.baseUrl,
          enabled,
        }),
      },
    ));
    if (!response) return;
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function deleteProvider(item: ProviderItem) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(item.providerId)}`,
      { method: "DELETE" },
    ));
    if (!response) return;
    toast.success(t("ai.providerDeleted"));
    router.refresh();
  }

  async function updateModelEnabled(
    provider: ProviderItem,
    model: ProviderModelItem,
    enabled: boolean,
  ) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(provider.providerId)}/models/${encodeURIComponent(model.modelId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerModelKey: model.modelKey,
          displayName: model.modelName,
          enabled,
          supportsToolCalls: model.supportsToolCalls,
          freeModel: isFreeModel(model),
          contextWindow: model.contextWindow,
          maxOutputTokens: model.maxOutputTokens,
          inputPointRate: Number(model.inputPointRate),
          cachedInputPointRate: Number(model.cachedInputPointRate),
          outputPointRate: Number(model.outputPointRate),
        }),
      },
    ));
    if (!response) return;
    toast.success(t("ai.saved"));
    router.refresh();
  }

  async function deleteModel(model: ProviderModelItem) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(model.providerId)}/models/${encodeURIComponent(model.modelId)}`,
      { method: "DELETE" },
    ));
    if (!response) return;
    toast.success(t("ai.modelDeleted"));
    router.refresh();
  }

  async function openRateHistory(
    provider: ProviderItem,
    model: ProviderModelItem,
  ) {
    setRateHistory({
      modelId: model.modelId,
      modelName: model.modelName,
      loading: true,
    });
    try {
      const data = await fetchAiAdminModelRateVersions(
        provider.providerId,
        model.modelId,
      );
      setRateHistory((current) => current?.modelId === model.modelId
        ? { ...current, loading: false, data }
        : current);
    } catch {
      setRateHistory((current) => current?.modelId === model.modelId
        ? { ...current, loading: false }
        : current);
      toast.error(t("ai.rateHistoryLoadError"));
    }
  }

  const rateHistoryColumns = [
    {
      title: t("ai.rateVersion"),
      dataIndex: "version",
      key: "version",
      render: (version: number, record: AiAdminModelRateVersion) => (
        <Space size={6}>
          <span>{`v${version}`}</span>
          {record.current ? (
            <Tag color="success">{t("ai.currentRateVersion")}</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: t("ai.inputRateShort"),
      dataIndex: "inputPointRate",
      key: "inputPointRate",
      render: (value: string) => BigInt(value).toLocaleString(locale),
    },
    {
      title: t("ai.cachedInputRateShort"),
      dataIndex: "cachedInputPointRate",
      key: "cachedInputPointRate",
      render: (value: string) => BigInt(value).toLocaleString(locale),
    },
    {
      title: t("ai.outputRateShort"),
      dataIndex: "outputPointRate",
      key: "outputPointRate",
      render: (value: string) => BigInt(value).toLocaleString(locale),
    },
    {
      title: t("ai.recordedAt"),
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString(locale),
    },
  ];

  return (
    <AdminPage
      actions={<Button onClick={() => editProvider()} type="primary">{t("ai.addProvider")}</Button>}
      title={t("ai.providers")}
    >
      <AdminAiSearch basePath="/app/manage/ai/providers" placeholder={t("ai.search")} searchParams={searchParams} />
      <AdminSection>
        {providers.items.length === 0 ? (
          <div className="admin-empty-state">
            <Empty description={t("ai.noProviders")} />
          </div>
        ) : (
          <AiProviderList>
            {providers.items.map((provider) => (
              <AiProviderCard
                actions={
                  <>
                    <Button
                      disabled={!provider.providerEnabled}
                      icon={<PlusOutlined />}
                      onClick={() => setModelDraft(createModelDraft(provider))}
                    >
                      {t("ai.addModel")}
                    </Button>
                    <Button
                      aria-label={t("ai.editProvider")}
                      onClick={() => editProvider(provider)}
                    >
                      {t("common.edit")}
                    </Button>
                    {provider.providerEnabled ? (
                      <Button
                        danger
                        onClick={() => setConfirmation({
                          title: t("ai.confirmDisableTitle"),
                          description: t("ai.confirmDisableDescription"),
                          confirmText: t("ai.confirmDisable"),
                          action: () => updateProviderEnabled(provider, false),
                        })}
                      >
                        {t("ai.disableProvider")}
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={pending}
                          onClick={() => void updateProviderEnabled(provider, true)}
                        >
                          {t("ai.enableProvider")}
                        </Button>
                        <Button
                          danger
                          disabled={pending}
                          onClick={() => setConfirmation({
                            title: t("ai.confirmDeleteTitle"),
                            description: t("ai.confirmDeleteDescription"),
                            confirmText: t("common.delete"),
                            action: () => deleteProvider(provider),
                          })}
                        >
                          {t("ai.deleteProvider")}
                        </Button>
                      </>
                    )}
                  </>
                }
                detail={provider.providerId}
                disabledLabel={t("ai.disabled")}
                enabled={provider.providerEnabled}
                enabledLabel={t("ai.enabled")}
                endpoint={provider.baseUrl}
                key={provider.providerId}
                name={provider.providerName}
              >
                {provider.models.length === 0 ? (
                  <AiModelEmpty>{t("ai.noModels")}</AiModelEmpty>
                ) : (
                  <AiModelTable
                    actionsLabel={t("common.actions")}
                    detailsLabel={t("ai.capabilitiesAndBilling")}
                    modelLabel={t("ai.model")}
                    statusLabel={t("ai.status")}
                  >
                    {provider.models.map((model) => (
                      <AiModelRow
                        actions={
                          <>
                            <Button
                              aria-label={t("ai.editModel")}
                              onClick={() => setModelDraft(createModelDraft(provider, model))}
                              type="link"
                            >
                              {t("common.edit")}
                            </Button>
                            <Button
                              onClick={() => void openRateHistory(provider, model)}
                              type="link"
                            >
                              {t("ai.rateHistory")}
                            </Button>
                            {model.modelEnabled ? (
                              <Button
                                danger
                                disabled={pending}
                                onClick={() => setConfirmation({
                                  title: t("ai.confirmDisableModelTitle"),
                                  description: t("ai.confirmDisableModelDescription"),
                                  confirmText: t("ai.disableModel"),
                                  action: () => updateModelEnabled(provider, model, false),
                                })}
                                type="link"
                              >
                                {t("ai.disableModel")}
                              </Button>
                            ) : (
                              <Button
                                disabled={pending || !provider.providerEnabled}
                                onClick={() => void updateModelEnabled(provider, model, true)}
                                type="link"
                              >
                                {t("ai.enableModel")}
                              </Button>
                            )}
                            {!model.modelEnabled ? (
                              <Button
                                danger
                                disabled={pending}
                                onClick={() => setConfirmation({
                                  title: t("ai.confirmDeleteModelTitle"),
                                  description: t("ai.confirmDeleteModelDescription"),
                                  confirmText: t("common.delete"),
                                  action: () => deleteModel(model),
                                })}
                                type="link"
                              >
                                {t("common.delete")}
                              </Button>
                            ) : null}
                          </>
                        }
                        details={
                          <>
                            {model.supportsToolCalls ? (
                              <Tag color="processing">{t("ai.toolCallsShort")}</Tag>
                            ) : (
                              <Tooltip title={t("ai.toolCallsRequiredWarning")}>
                                <Tag color="warning">{t("ai.chatOnly")}</Tag>
                              </Tooltip>
                            )}
                            <Tooltip
                              title={t("ai.modelLimits", {
                                context: model.contextWindow.toLocaleString(),
                                output: model.maxOutputTokens.toLocaleString(),
                              })}
                            >
                              <Tag>{model.contextWindow.toLocaleString()}</Tag>
                            </Tooltip>
                            <Tag color={isFreeModel(model) ? "success" : "default"}>
                              {isFreeModel(model)
                                ? t("ai.freeModelShort")
                                : t("ai.rateSummary", {
                                  cached: model.cachedInputPointRate,
                                  input: model.inputPointRate,
                                  output: model.outputPointRate,
                                })}
                            </Tag>
                          </>
                        }
                        key={model.modelId}
                        modelKey={`${model.modelKey} · ${model.modelId}`}
                        name={model.modelName}
                        status={
                          <Tag color={model.modelEnabled ? "success" : "default"}>
                            {model.modelEnabled ? t("ai.enabled") : t("ai.disabled")}
                          </Tag>
                        }
                      />
                    ))}
                  </AiModelTable>
                )}
              </AiProviderCard>
            ))}
          </AiProviderList>
        )}
        <NumberedPagination
          basePath="/app/manage/ai/providers"
          page={providers.page}
          pageSize={providers.pageSize}
          searchParams={searchParams}
          total={providers.total}
          totalPages={providers.totalPages}
        />
      </AdminSection>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: pending }}
        okText={t("common.confirm")}
        onCancel={() => setProviderDraft(undefined)}
        onOk={() => void saveProvider()}
        open={Boolean(providerDraft) && !reauthOpen}
        title={providerDraft?.providerId ? t("ai.editProvider") : t("ai.addProvider")}
        width={680}
      >
        {providerDraft ? (
          <Form className="admin-dialog-form admin-ai-provider-form" layout="vertical">
            <Form.Item label={t("ai.provider")}>
              <Input onChange={(event) => setProviderDraft({ ...providerDraft, providerName: event.target.value })} value={providerDraft.providerName} />
            </Form.Item>
            <Form.Item label={t("ai.endpoint")}>
              <Input onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.target.value })} value={providerDraft.baseUrl} />
            </Form.Item>
            <Form.Item label={t("ai.apiKey")}>
              <Input.Password onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.target.value })} placeholder={providerDraft.providerId ? t("ai.apiKeyPlaceholder") : undefined} value={providerDraft.apiKey} />
            </Form.Item>
          </Form>
        ) : null}
      </Modal>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ loading: pending }}
        okText={t("common.confirm")}
        onCancel={() => setModelDraft(undefined)}
        onOk={() => void saveModel()}
        open={Boolean(modelDraft) && !reauthOpen}
        title={modelDraft?.modelId ? t("ai.editModel") : t("ai.addModel")}
        width={680}
      >
        {modelDraft ? (
          <Form className="admin-dialog-form admin-ai-provider-form" layout="vertical">
            <p className="admin-dialog-description">
              {t("ai.modelProvider", { provider: modelDraft.providerName })}
            </p>
            <div className="admin-ai-provider-form__grid">
              <Form.Item label={t("ai.model")}>
                <Input onChange={(event) => setModelDraft({ ...modelDraft, modelName: event.target.value })} value={modelDraft.modelName} />
              </Form.Item>
              <Form.Item label={t("ai.modelKey")}>
                <Input onChange={(event) => setModelDraft({ ...modelDraft, modelKey: event.target.value })} value={modelDraft.modelKey} />
              </Form.Item>
              <Form.Item label={t("ai.contextWindow")}>
                <InputNumber min={1} onChange={(value) => setModelDraft({ ...modelDraft, contextWindow: asNumber(value, 1) })} value={modelDraft.contextWindow} />
              </Form.Item>
              <Form.Item label={t("ai.maxOutputTokens")}>
                <InputNumber min={1} onChange={(value) => setModelDraft({ ...modelDraft, maxOutputTokens: asNumber(value, 1) })} value={modelDraft.maxOutputTokens} />
              </Form.Item>
            </div>
            <div className="admin-ai-provider-form__billing">
              <div className="admin-ai-provider-form__toggles">
                <Checkbox checked={modelDraft.freeModel} onChange={(event) => setModelDraft({
                  ...modelDraft,
                  freeModel: event.target.checked,
                  ...(event.target.checked ? {
                    inputPointRate: 0,
                    cachedInputPointRate: 0,
                    outputPointRate: 0,
                  } : {}),
                })}>{t("ai.freeModel")}</Checkbox>
                <Space size={6}>
                  <Checkbox checked={modelDraft.supportsToolCalls} onChange={(event) => setModelDraft({ ...modelDraft, supportsToolCalls: event.target.checked })}>
                    {t("ai.supportsToolCalls")}
                  </Checkbox>
                  {!modelDraft.supportsToolCalls ? (
                    <Tooltip title={t("ai.toolCallsRequiredWarning")}>
                      <ExclamationCircleFilled
                        aria-label={t("ai.toolCallsRequiredWarning")}
                        style={{ color: token.colorWarning }}
                        tabIndex={0}
                      />
                    </Tooltip>
                  ) : null}
                </Space>
              </div>
              <div className="admin-ai-provider-form__rates">
                <Form.Item label={t("ai.inputRate")}>
                  <InputNumber disabled={modelDraft.freeModel} min={0} onChange={(value) => setModelDraft({ ...modelDraft, inputPointRate: asNumber(value) })} value={modelDraft.inputPointRate} />
                </Form.Item>
                <Form.Item label={t("ai.cachedInputRate")}>
                  <InputNumber disabled={modelDraft.freeModel} min={0} onChange={(value) => setModelDraft({ ...modelDraft, cachedInputPointRate: asNumber(value) })} value={modelDraft.cachedInputPointRate} />
                </Form.Item>
                <Form.Item label={t("ai.outputRate")}>
                  <InputNumber disabled={modelDraft.freeModel} min={0} onChange={(value) => setModelDraft({ ...modelDraft, outputPointRate: asNumber(value) })} value={modelDraft.outputPointRate} />
                </Form.Item>
              </div>
            </div>
          </Form>
        ) : null}
      </Modal>

      <Modal
        footer={null}
        onCancel={() => setRateHistory(undefined)}
        open={Boolean(rateHistory)}
        title={rateHistory
          ? t("ai.rateHistoryTitle", { model: rateHistory.modelName })
          : ""}
        width={780}
      >
        <Spin spinning={rateHistory?.loading ?? false}>
          <Table<AiAdminModelRateVersion>
            columns={rateHistoryColumns}
            dataSource={rateHistory?.data?.versions ?? []}
            locale={{ emptyText: t("ai.noRateHistory") }}
            pagination={false}
            rowKey="version"
            size="small"
          />
        </Spin>
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
