"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  theme,
  Tooltip,
} from "antd";

import { useI18n } from "@/i18n/I18nProvider";
import type {
  PersonalAiModel,
  PersonalAiModelInput,
  PersonalAiProvider,
  PersonalAiProviderInput,
} from "@/lib/ai/settings-client";

export function AiProviderEditorModal({
  busy,
  onCancel,
  onSubmit,
  open,
  provider,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: PersonalAiProviderInput) => Promise<void>;
  open: boolean;
  provider?: PersonalAiProvider;
}) {
  const { t } = useI18n();
  return (
    <Modal
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={open}
      title={t(
        provider
          ? "ai.settings.editProvider"
          : "ai.settings.addProvider",
      )}
      width={560}
    >
      <Form
        initialValues={{
          baseUrl: provider?.baseUrl ?? "",
          providerName: provider?.providerName ?? "",
        }}
        layout="vertical"
        onFinish={(value) => void onSubmit(value)}
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
            provider
              ? t("ai.settings.keyKeep", {
                  masked: provider.maskedApiKey,
                })
              : undefined
          }
          label={t("ai.settings.apiKey")}
          name="apiKey"
          rules={[{ required: !provider }]}
        >
          <Input.Password autoComplete="new-password" maxLength={4_000} />
        </Form.Item>
        <Form.Item noStyle>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button disabled={busy} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button htmlType="submit" loading={busy} type="primary">
              {t("editor.save")}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function AiModelEditorModal({
  busy,
  model,
  onCancel,
  onSubmit,
  open,
}: {
  busy: boolean;
  model?: PersonalAiModel;
  onCancel: () => void;
  onSubmit: (value: PersonalAiModelInput) => Promise<void>;
  open: boolean;
}) {
  const { t } = useI18n();
  const { token } = theme.useToken();

  return (
    <Modal
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={open}
      title={t(model ? "ai.settings.editModel" : "ai.settings.addModel")}
      width={600}
    >
      <Form
        initialValues={{
          contextWindow: model?.contextWindow ?? 128_000,
          maxOutputTokens: model?.maxOutputTokens ?? 4_096,
          modelKey: model?.modelKey ?? "",
          modelName: model?.modelName ?? "",
          supportsStreaming: model?.supportsStreaming ?? true,
          supportsToolCalls: model?.supportsToolCalls ?? true,
        }}
        layout="vertical"
        onFinish={(value) => void onSubmit(value)}
      >
        <Form.Item
          label={t("ai.settings.modelName")}
          name="modelName"
          rules={[{ required: true }]}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          label={t("ai.settings.modelKey")}
          name="modelKey"
          rules={[{ required: true }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          <Form.Item
            label={t("ai.settings.contextWindow")}
            name="contextWindow"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label={t("ai.settings.maxOutputTokens")}
            name="maxOutputTokens"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item
          label={t("ai.settings.streaming")}
          name="supportsStreaming"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(previous, current) =>
            previous.supportsToolCalls !== current.supportsToolCalls
          }
        >
          {({ getFieldValue }) => {
            const supportsToolCalls = getFieldValue("supportsToolCalls") !== false;

            return (
              <Form.Item
                label={(
                  <Space size={6}>
                    {t("ai.settings.toolCalls")}
                    {!supportsToolCalls ? (
                      <Tooltip
                        title={t("ai.settings.toolCallsRequiredWarning")}
                      >
                        <ExclamationCircleFilled
                          aria-label={t(
                            "ai.settings.toolCallsRequiredWarning",
                          )}
                          style={{ color: token.colorWarning }}
                          tabIndex={0}
                        />
                      </Tooltip>
                    ) : null}
                  </Space>
                )}
                name="supportsToolCalls"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            );
          }}
        </Form.Item>
        <Form.Item noStyle>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button disabled={busy} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button htmlType="submit" loading={busy} type="primary">
              {t("editor.save")}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
