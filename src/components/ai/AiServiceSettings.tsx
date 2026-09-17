"use client";

import {
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Popconfirm,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import {
  AiModelEmpty,
  AiModelRow,
  AiModelTable,
  AiProviderCard,
  AiProviderList,
} from "@/components/ai/model-management/AiProviderCatalog";
import {
  createPersonalAiModel,
  createPersonalAiProvider,
  deletePersonalAiModel,
  deletePersonalAiProvider,
  fetchAiSettings,
  testPersonalAiModel,
  updatePersonalAiModel,
  updatePersonalAiProvider,
  type AiSettingsSnapshot,
  type PersonalAiModel,
  type PersonalAiModelInput,
  type PersonalAiProvider,
  type PersonalAiProviderInput,
} from "@/lib/ai/settings-client";

import {
  AiModelEditorModal,
  AiProviderEditorModal,
} from "./AiServiceSettingsDialogs";
import { useAiServiceSettingsStyles } from "./AiServiceSettings.style";

interface ModelEditorState {
  model?: PersonalAiModel;
  provider: PersonalAiProvider;
}

export function AiServiceSettings() {
  const { styles } = useAiServiceSettingsStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [providerEditor, setProviderEditor] = useState<
    { provider?: PersonalAiProvider } | undefined
  >();
  const [modelEditor, setModelEditor] = useState<ModelEditorState>();

  const reportLoadError = useEffectEvent(() => {
    toast.error(t("ai.settings.loadError"));
  });
  const load = useCallback(async () => {
    setSnapshot(await fetchAiSettings());
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await fetchAiSettings();
        if (active) setSnapshot(next);
      } catch {
        if (active) reportLoadError();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function runOperation(
    operation: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusy(true);
    try {
      await operation();
      await load();
      toast.success(successMessage);
    } catch {
      toast.error({
        key: "ai-settings-error",
        content: t("ai.settings.saveError"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveProvider(value: PersonalAiProviderInput) {
    const current = providerEditor?.provider;
    if (current) {
      await runOperation(
        async () => {
          await updatePersonalAiProvider(current.id, {
            ...value,
            enabled: current.enabled,
          });
          setProviderEditor(undefined);
        },
        t("ai.settings.saved"),
      );
      return;
    }
    if (!value.apiKey) return;
    await runOperation(
      async () => {
        await createPersonalAiProvider({ ...value, apiKey: value.apiKey! });
        setProviderEditor(undefined);
      },
      t("ai.settings.saved"),
    );
  }

  async function saveModel(value: PersonalAiModelInput) {
    if (!modelEditor) return;
    const current = modelEditor.model;
    await runOperation(
      async () => {
        if (current) {
          await updatePersonalAiModel(modelEditor.provider.id, current.id, {
            ...value,
            enabled: current.enabled,
          });
        } else {
          await createPersonalAiModel(modelEditor.provider.id, value);
        }
        setModelEditor(undefined);
      },
      t("ai.settings.saved"),
    );
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    );
  }
  if (!snapshot) return null;

  const quota = snapshot.quota;
  const monthlyLimit = quota?.monthlyLimit ?? snapshot.defaultMonthlyPoints;
  const availablePoints = quota?.availablePoints ?? monthlyLimit;
  const modelCount = snapshot.providers.reduce(
    (count, provider) => count + provider.models.length,
    0,
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>{t("ai.settings.title")}</h1>
          <p className={styles.description}>{t("ai.settings.description")}</p>
        </div>
        {snapshot.byokEnabled ? (
          <Button
            icon={<PlusOutlined />}
            onClick={() => setProviderEditor({})}
            type="primary"
          >
            {t("ai.settings.addProvider")}
          </Button>
        ) : null}
      </header>

      <section className={styles.overview} aria-label={t("ai.settings.overview")}>
        <div className={styles.metric}>
          <span>{t("ai.settings.platformStatus")}</span>
          <Tag color={snapshot.platformEnabled ? "success" : "default"}>
            {snapshot.platformEnabled
              ? t("ai.settings.available")
              : t("ai.settings.unavailable")}
          </Tag>
        </div>
        <div className={styles.metric}>
          <span>{t("ai.settings.remainingPoints")}</span>
          <strong>{availablePoints.toLocaleString()}</strong>
        </div>
        <div className={styles.metric}>
          <span>{t("ai.settings.usedPoints")}</span>
          <strong>{(quota?.usedPoints ?? 0).toLocaleString()}</strong>
        </div>
      </section>

      <section className={styles.catalog}>
        <div className={styles.catalogToolbar}>
          <div>
            <h2>{t("ai.settings.personalTitle")}</h2>
            <p>
              {t("ai.settings.catalogCount", {
                models: modelCount,
                providers: snapshot.providers.length,
              })}
            </p>
          </div>
        </div>

        {!snapshot.byokEnabled ? (
          <div className={styles.empty}>
            <Empty description={t("ai.settings.personalDisabled")} />
          </div>
        ) : snapshot.providers.length === 0 ? (
          <div className={styles.empty}>
            <Empty
              description={t("ai.settings.noProviders")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button
                icon={<PlusOutlined />}
                onClick={() => setProviderEditor({})}
                type="primary"
              >
                {t("ai.settings.addProvider")}
              </Button>
            </Empty>
          </div>
        ) : (
          <AiProviderList>
            {snapshot.providers.map((provider) => (
              <AiProviderCard
                actions={
                  <>
                    <Button
                      disabled={!provider.enabled}
                      icon={<PlusOutlined />}
                      onClick={() => setModelEditor({ provider })}
                    >
                      {t("ai.settings.addModel")}
                    </Button>
                    <Button onClick={() => setProviderEditor({ provider })}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void runOperation(
                          async () => {
                            await updatePersonalAiProvider(provider.id, {
                              baseUrl: provider.baseUrl,
                              enabled: !provider.enabled,
                              providerName: provider.providerName,
                            });
                          },
                          t(
                            provider.enabled
                              ? "ai.settings.disabled"
                              : "ai.settings.enabled",
                          ),
                        )
                      }
                    >
                      {t(
                        provider.enabled
                          ? "ai.settings.disable"
                          : "ai.settings.enable",
                      )}
                    </Button>
                    {!provider.enabled ? (
                      <Popconfirm
                        description={t("ai.settings.deleteProviderDescription")}
                        onConfirm={() =>
                          void runOperation(
                            () => deletePersonalAiProvider(provider.id),
                            t("ai.settings.deleted"),
                          )
                        }
                        title={t("ai.settings.deleteProvider")}
                      >
                        <Button danger disabled={busy}>
                          {t("common.delete")}
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </>
                }
                detail={provider.maskedApiKey}
                disabledLabel={t("ai.settings.disabled")}
                enabled={provider.enabled}
                enabledLabel={t("ai.settings.enabled")}
                endpoint={provider.baseUrl}
                key={provider.id}
                name={provider.providerName}
              >

                {provider.models.length === 0 ? (
                  <AiModelEmpty>{t("ai.settings.noModels")}</AiModelEmpty>
                ) : (
                  <AiModelTable
                    actionsLabel={t("ai.settings.actions")}
                    detailsLabel={t("ai.settings.capabilities")}
                    modelLabel={t("ai.settings.model")}
                    statusLabel={t("ai.settings.status")}
                  >
                    {provider.models.map((model) => (
                      <AiModelRow
                        actions={
                          <>
                            <Button
                              disabled={busy || !provider.enabled}
                              onClick={() =>
                                void runOperation(
                                  () =>
                                    testPersonalAiModel(
                                      provider.id,
                                      model.modelKey,
                                    ),
                                  t("ai.settings.connectionSuccess"),
                                )
                              }
                              type="link"
                            >
                              {t("ai.settings.testConnection")}
                            </Button>
                            <Button
                              onClick={() =>
                                setModelEditor({ provider, model })
                              }
                              type="link"
                            >
                              {t("common.edit")}
                            </Button>
                            <Button
                              disabled={busy || (!provider.enabled && !model.enabled)}
                              onClick={() =>
                                void runOperation(
                                  async () => {
                                    await updatePersonalAiModel(
                                      provider.id,
                                      model.id,
                                      {
                                        contextWindow: model.contextWindow,
                                        enabled: !model.enabled,
                                        maxOutputTokens: model.maxOutputTokens,
                                        modelKey: model.modelKey,
                                        modelName: model.modelName,
                                        supportsStreaming:
                                          model.supportsStreaming,
                                        supportsToolCalls:
                                          model.supportsToolCalls,
                                      },
                                    );
                                  },
                                  t(
                                    model.enabled
                                      ? "ai.settings.disabled"
                                      : "ai.settings.enabled",
                                  ),
                                )
                              }
                              type="link"
                            >
                              {t(
                                model.enabled
                                  ? "ai.settings.disable"
                                  : "ai.settings.enable",
                              )}
                            </Button>
                            {!model.enabled ? (
                              <Popconfirm
                                description={t(
                                  "ai.settings.deleteModelDescription",
                                )}
                                onConfirm={() =>
                                  void runOperation(
                                    () =>
                                      deletePersonalAiModel(
                                        provider.id,
                                        model.id,
                                      ),
                                    t("ai.settings.deleted"),
                                  )
                                }
                                title={t("ai.settings.deleteModel")}
                              >
                                <Button danger disabled={busy} type="link">
                                  {t("common.delete")}
                                </Button>
                              </Popconfirm>
                            ) : null}
                          </>
                        }
                        details={
                          <>
                          {model.supportsStreaming ? (
                            <Tag>{t("ai.settings.streaming")}</Tag>
                          ) : null}
                          {model.supportsToolCalls ? (
                            <Tag color="processing">
                              {t("ai.settings.toolCallsShort")}
                            </Tag>
                          ) : null}
                          <Tooltip
                            title={t("ai.settings.modelLimits", {
                              context: model.contextWindow.toLocaleString(),
                              output: model.maxOutputTokens.toLocaleString(),
                            })}
                          >
                            <Tag>{model.contextWindow.toLocaleString()}</Tag>
                          </Tooltip>
                          </>
                        }
                        key={model.id}
                        modelKey={model.modelKey}
                        name={model.modelName}
                        status={
                          <Tag color={model.enabled ? "success" : "default"}>
                            {model.enabled
                              ? t("ai.settings.enabled")
                              : t("ai.settings.disabled")}
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
      </section>

      {providerEditor ? (
        <AiProviderEditorModal
          busy={busy}
          onCancel={() => setProviderEditor(undefined)}
          onSubmit={saveProvider}
          open
          provider={providerEditor.provider}
        />
      ) : null}
      {modelEditor ? (
        <AiModelEditorModal
          busy={busy}
          model={modelEditor.model}
          onCancel={() => setModelEditor(undefined)}
          onSubmit={saveModel}
          open
        />
      ) : null}
    </div>
  );
}
