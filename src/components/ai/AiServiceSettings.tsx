"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { Button, Card, Form, Input, Popconfirm, Spin, Switch } from "antd";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import {
  disableAiSettings,
  fetchAiSettings,
  saveAiSettings,
  testAiSettings,
  type AiSettingsSnapshot,
  type PersonalAiSettingsInput,
} from "@/lib/ai/settings-client";

import { useAiServiceSettingsStyles } from "./AiServiceSettings.style";

export function AiServiceSettings() {
  const { styles } = useAiServiceSettingsStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const [form] = Form.useForm<PersonalAiSettingsInput>();
  const [snapshot, setSnapshot] = useState<AiSettingsSnapshot>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reportLoadError = useEffectEvent(() => {
    toast.error(t("ai.settings.loadError"));
  });
  const load = useCallback(async () => {
    const next = await fetchAiSettings();
    setSnapshot(next);
    if (next.personal) {
      form.setFieldsValue({
        providerName: next.personal.providerName,
        baseUrl: next.personal.baseUrl,
        modelKey: next.personal.modelKey,
        modelName: next.personal.modelName,
        supportsToolCalls: next.personal.supportsToolCalls,
        apiKey: undefined,
      });
    }
  }, [form]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch {
        if (active) reportLoadError();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function withBusy(operation: () => Promise<void>) {
    setBusy(true);
    try {
      await operation();
    } catch {
      toast.error({ key: "ai-settings-error", content: t("ai.settings.saveError") });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spin />;
  if (!snapshot) return null;
  const quota = snapshot.quota;
  const monthlyLimit = quota?.monthlyLimit ?? snapshot.defaultMonthlyPoints;
  const availablePoints = quota?.availablePoints ?? monthlyLimit;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{t("ai.settings.title")}</h1>
        <p>{t("ai.settings.description")}</p>
      </header>
      <section className={styles.overview}>
        <div className={styles.metric}>
          <span>{t("ai.settings.platformStatus")}</span>
          <strong>
            {snapshot.platformEnabled
              ? t("ai.settings.available")
              : t("ai.settings.unavailable")}
          </strong>
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
      <Card
        className={styles.card}
        title={t("ai.settings.personalTitle")}
      >
        {!snapshot.byokEnabled ? (
          <p>{t("ai.settings.personalDisabled")}</p>
        ) : (
          <Form
            form={form}
            layout="vertical"
            initialValues={{ supportsToolCalls: false }}
            onFinish={(values) =>
              void withBusy(async () => {
                await saveAiSettings(values);
                await load();
                toast.success(t("ai.settings.saved"));
              })
            }
          >
            <Form.Item
              label={t("ai.settings.providerName")}
              name="providerName"
              rules={[{ required: true }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              label={t("ai.settings.endpoint")}
              name="baseUrl"
              rules={[{ required: true, type: "url" }]}
            >
              <Input placeholder="https://api.example.com/v1" />
            </Form.Item>
            <Form.Item
              extra={
                snapshot.personal
                  ? t("ai.settings.keyKeep", {
                      masked: snapshot.personal.maskedApiKey,
                    })
                  : undefined
              }
              label={t("ai.settings.apiKey")}
              name="apiKey"
              rules={[{ required: !snapshot.personal }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label={t("ai.settings.modelKey")}
              name="modelKey"
              rules={[{ required: true }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              label={t("ai.settings.modelName")}
              name="modelName"
              rules={[{ required: true }]}
            >
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item
              label={t("ai.settings.toolCalls")}
              name="supportsToolCalls"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <div className={styles.actions}>
              <Button htmlType="submit" loading={busy} type="primary">
                {t("editor.save")}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void form.validateFields().then((values) =>
                    withBusy(async () => {
                      await testAiSettings(values);
                      toast.success(t("ai.settings.connectionSuccess"));
                    }),
                  )
                }
              >
                {t("ai.settings.testConnection")}
              </Button>
              {snapshot.personal?.enabled ? (
                <Popconfirm
                  title={t("ai.settings.disableConfirm")}
                  onConfirm={() =>
                    void withBusy(async () => {
                      await disableAiSettings();
                      await load();
                      toast.success(t("ai.settings.disabled"));
                    })
                  }
                >
                  <Button danger disabled={busy}>
                    {t("ai.settings.disable")}
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
