"use client";

import { Button, Checkbox, Form, Input, InputNumber, Modal, Switch } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminAiSearch } from "@/components/admin/ai/AdminAiSearch";
import type {
  ProviderItem,
  ProviderModelItem,
} from "@/components/admin/ai/types";
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
  const router = useRouter();
  const { toast } = useAppFeedback();
  const { pending, reauthModal, reauthOpen, runSensitive } = useAdminAiSensitiveAction();
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>();
  const [modelDraft, setModelDraft] = useState<ModelDraft>();
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

  async function disableProvider(item: ProviderItem) {
    const response = await runSensitive(() => fetch(
      `/api/manage/ai/providers/${encodeURIComponent(item.providerId)}`,
      { method: "DELETE" },
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

  return (
    <AdminPage
      actions={<Button onClick={() => editProvider()} type="primary">{t("ai.addProvider")}</Button>}
      title={t("ai.providers")}
    >
      <AdminAiSearch basePath="/app/manage/ai/providers" placeholder={t("ai.search")} searchParams={searchParams} />
      <AdminSection>
        <p className="admin-section-description">{t("ai.providersDescription")}</p>
        <AdminTable
          actionColumn
          headers={[t("ai.provider"), t("ai.models"), t("ai.status"), t("common.actions")]}
          pagination={{
            basePath: "/app/manage/ai/providers",
            page: providers.page,
            pageSize: providers.pageSize,
            searchParams,
            total: providers.total,
            totalPages: providers.totalPages,
          }}
          rows={providers.items.map((provider) => [
            <AdminIdentity
              key="provider"
              title={provider.providerName}
              description={`${provider.baseUrl} · ${provider.providerId}`}
            />,
            <div className="admin-ai-model-list" key="models">
              <div className="admin-ai-model-list__header">
                <span>{t("ai.modelCount", { count: provider.models.length })}</span>
                <Button onClick={() => setModelDraft(createModelDraft(provider))} size="small" type="link">
                  {t("ai.addModel")}
                </Button>
              </div>
              {provider.models.length ? provider.models.map((model) => (
                <div className="admin-ai-model-list__item" key={model.modelId}>
                  <div className="admin-ai-model-list__identity">
                    <AdminIdentity
                      title={model.modelName}
                      description={`${model.modelKey} · ${model.modelId}`}
                    />
                    <span className="admin-ai-model-list__rates">
                      {isFreeModel(model)
                        ? t("ai.freeModelShort")
                        : `${model.inputPointRate} / ${model.cachedInputPointRate} / ${model.outputPointRate} · v${model.rateCardVersion}`}
                    </span>
                  </div>
                  <AdminStatus tone={model.modelEnabled ? "success" : "default"}>
                    {model.modelEnabled ? t("ai.enabled") : t("ai.disabled")}
                  </AdminStatus>
                  <AdminTableActions>
                    <Button aria-label={t("ai.editModel")} onClick={() => setModelDraft(createModelDraft(provider, model))} size="small" type="link">
                      {t("common.edit")}
                    </Button>
                    {!model.modelEnabled ? (
                      <Button danger onClick={() => setConfirmation({
                        title: t("ai.confirmDeleteModelTitle"),
                        description: t("ai.confirmDeleteModelDescription"),
                        confirmText: t("common.delete"),
                        action: () => deleteModel(model),
                      })} size="small" type="link">
                        {t("common.delete")}
                      </Button>
                    ) : null}
                  </AdminTableActions>
                </div>
              )) : <p className="admin-ai-model-list__empty">{t("ai.noModels")}</p>}
            </div>,
            <AdminStatus key="status" tone={provider.providerEnabled ? "success" : "default"}>
              {provider.providerEnabled ? t("ai.enabled") : t("ai.disabled")}
            </AdminStatus>,
            <AdminTableActions key="actions">
              <Button aria-label={t("ai.editProvider")} onClick={() => editProvider(provider)} type="link">{t("common.edit")}</Button>
              {provider.providerEnabled ? (
                <Button danger onClick={() => setConfirmation({
                  title: t("ai.confirmDisableTitle"),
                  description: t("ai.confirmDisableDescription"),
                  confirmText: t("ai.confirmDisable"),
                  action: () => disableProvider(provider),
                })} type="link">
                  {t("ai.disableProvider")}
                </Button>
              ) : null}
            </AdminTableActions>,
          ])}
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
            <label className="admin-ai-provider-form__switch">
              {t("ai.enabled")}
              <Switch checked={providerDraft.providerEnabled} onChange={(checked) => setProviderDraft({ ...providerDraft, providerEnabled: checked })} />
            </label>
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
                <Checkbox checked={modelDraft.supportsToolCalls} onChange={(event) => setModelDraft({ ...modelDraft, supportsToolCalls: event.target.checked })}>
                  {t("ai.supportsToolCalls")}
                </Checkbox>
                <label className="admin-ai-provider-form__switch">
                  {t("ai.enabled")}
                  <Switch
                    checked={modelDraft.modelEnabled}
                    disabled={!modelDraft.providerEnabled}
                    onChange={(checked) => setModelDraft({ ...modelDraft, modelEnabled: checked })}
                  />
                </label>
              </div>
              {!modelDraft.providerEnabled ? (
                <p className="admin-dialog-description">{t("ai.enableProviderBeforeModel")}</p>
              ) : null}
              <p className="admin-dialog-description">{t("ai.rateDescription")}</p>
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
