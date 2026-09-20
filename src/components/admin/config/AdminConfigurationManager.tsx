"use client";

import { Alert, Button, Collapse, Form, Modal, Space, Tag } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";
import { AdminPage } from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { ManagedConfigFieldView } from "@/lib/config/admin/types";
import type { ConfigKey } from "@/lib/config/registry";

import { ConfigurationField } from "./ConfigurationField";
import { ConfigurationHistory } from "./ConfigurationHistory";
import {
  configurationFieldMessageKeys,
  configurationGroupMessageKeys,
  parseManagedConfigurationHistory,
  parseManagedConfigurationView,
  type ConfigurationFieldChange,
  type ManagedConfigurationRevisionView,
  type ManagedConfigurationView,
} from "./types";

const useStyles = createStyles(({ css, token }) => ({
  fieldGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: ${token.screenLG}px) {
      grid-template-columns: 1fr;
    }
  `,
  status: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  `,
}));

const errorSchema = z.object({ error: z.string() });

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function responseError(response: Response) {
  const result = errorSchema.safeParse(await response.json().catch(() => null));
  return result.success ? result.data.error : "configuration_operation_failed";
}

export function AdminConfigurationManager({
  canEdit,
  canPublish,
  canReadHistory,
  canRollback,
  initialState,
}: {
  canEdit: boolean;
  canPublish: boolean;
  canReadHistory: boolean;
  canRollback: boolean;
  initialState: ManagedConfigurationView;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const { styles } = useStyles();
  const router = useRouter();
  const { toast } = useAppFeedback();
  const { pending, reauthModal, runSensitive } = useAdminAiSensitiveAction();
  const [state, setState] = useState(initialState);
  const [changes, setChanges] = useState<Partial<Record<ConfigKey, ConfigurationFieldChange>>>({});
  const [savedChanges, setSavedChanges] = useState<Partial<Record<ConfigKey, ConfigurationFieldChange>>>({});
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<ManagedConfigurationRevisionView[]>([]);
  const [rollbackRevision, setRollbackRevision] = useState<ManagedConfigurationRevisionView>();

  const fieldByKey = new Map(state.fields.map((field) => [field.key, field]));
  const changeEntries = Object.entries(changes) as Array<
    [ConfigKey, ConfigurationFieldChange]
  >;
  const savedChangeEntries = Object.entries(savedChanges) as Array<
    [ConfigKey, ConfigurationFieldChange]
  >;
  const hasEmptySecretReplacement = changeEntries.some(
    ([key, change]) =>
      fieldByKey.get(key)?.sensitive &&
      change.operation === "set" &&
      change.value === "",
  );

  function labelFor(field: string) {
    const key = field as ConfigKey;
    return configurationFieldMessageKeys[key]
      ? t(configurationFieldMessageKeys[key])
      : field;
  }

  function updateField(
    field: ManagedConfigFieldView,
    change?: ConfigurationFieldChange,
  ) {
    setChanges((current) => {
      const next = { ...current };
      if (
        !change ||
        (!field.sensitive &&
          change.operation === "set" &&
          valuesEqual(change.value, field.value))
      ) {
        delete next[field.key];
      } else {
        next[field.key] = change;
      }
      return next;
    });
  }

  async function loadCurrentState() {
    const response = await fetch("/api/manage/configuration", {
      cache: "no-store",
    });
    if (!response.ok) return false;
    setState(parseManagedConfigurationView(await response.json()));
    setChanges({});
    return true;
  }

  async function saveDraft() {
    if (changeEntries.length === 0) return;
    setSaving(true);
    try {
      const response = await fetch("/api/manage/configuration", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseVersion: state.activeRevision.version,
          draftRevisionId: state.draftRevision.id,
          changes: changeEntries.map(([key, change]) => ({ key, ...change })),
        }),
      });
      if (response.status === 409) {
        await loadCurrentState();
        toast.error(t("configuration.conflict"));
        return;
      }
      if (!response.ok) {
        toast.error(t("configuration.saveFailed"));
        return;
      }
      setState(parseManagedConfigurationView(await response.json()));
      setSavedChanges(changes);
      setChanges({});
      toast.success(t("configuration.saved"));
      router.refresh();
    } catch {
      toast.error(t("configuration.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function publishConfiguration() {
    const response = await runSensitive(() =>
      fetch("/api/manage/configuration/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseVersion: state.activeRevision.version,
          draftRevisionId: state.draftRevision.id,
        }),
      }),
    );
    if (!response) return;
    try {
      setState(parseManagedConfigurationView(await response.json()));
      setSavedChanges({});
      setPublishOpen(false);
      toast.success(t("configuration.published"));
      router.refresh();
    } catch {
      toast.error(t("configuration.publishFailed"));
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/manage/configuration/history", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response));
      setHistory(parseManagedConfigurationHistory(await response.json()));
    } catch {
      toast.error(t("configuration.historyFailed"));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function prepareRollback() {
    if (!rollbackRevision) return;
    const revision = rollbackRevision;
    const response = await runSensitive(() =>
      fetch(
        `/api/manage/configuration/revisions/${encodeURIComponent(revision.id)}/rollback`,
        { method: "POST" },
      ),
    );
    if (!response) return;
    try {
      setState(parseManagedConfigurationView(await response.json()));
      setSavedChanges({});
      setRollbackRevision(undefined);
      setHistoryOpen(false);
      toast.success(t("configuration.rollbackPrepared"));
      router.refresh();
    } catch {
      toast.error(t("configuration.rollbackFailed"));
    }
  }

  const groups = Object.entries(configurationGroupMessageKeys).flatMap(
    ([group, messageKey]) => {
      const fields = state.fields.filter((field) => field.group === group);
      return fields.length === 0 ? [] : [{
        key: group,
        label: t(messageKey),
        children: (
          <div className={styles.fieldGrid}>
            {fields.map((field) => (
              <ConfigurationField
                change={changes[field.key]}
                disabled={!canEdit || saving}
                field={field}
                key={field.key}
                label={labelFor(field.key)}
                text={{
                  cancelReplacement: t("common.cancel"),
                  changed: t("configuration.changed"),
                  clear: t("configuration.clear"),
                  configured: field.configured
                    ? t("configuration.configured")
                    : t("configuration.notConfigured"),
                  hot: t("configuration.apply.hot"),
                  pendingClear: t("configuration.pendingClear"),
                  replace: t("configuration.replace"),
                  restart: t("configuration.apply.restart"),
                }}
                onChange={(change) => updateField(field, change)}
              />
            ))}
          </div>
        ),
      }];
    },
  );

  const publishEntries = savedChangeEntries.length > 0
    ? savedChangeEntries
    : changeEntries;
  const immediate = publishEntries.filter(([key]) => fieldByKey.get(key)?.applyMode === "hot");
  const restart = publishEntries.filter(([key]) => fieldByKey.get(key)?.applyMode === "restart");

  return (
    <AdminPage
      actions={(
        <Space wrap>
          {canReadHistory ? (
            <Button onClick={() => void openHistory()}>
              {t("configuration.history")}
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              disabled={changeEntries.length === 0 || hasEmptySecretReplacement}
              loading={saving}
              onClick={() => void saveDraft()}
            >
              {t("configuration.saveDraft")}
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              disabled={changeEntries.length > 0}
              type="primary"
              onClick={() => setPublishOpen(true)}
            >
              {t("configuration.publish")}
            </Button>
          ) : null}
        </Space>
      )}
      title={t("configuration.title")}
    >
      <div className={styles.status}>
        <Tag>{t("configuration.activeVersion", { version: state.activeRevision.version })}</Tag>
        <Tag>{t("configuration.draftVersion", { version: state.draftRevision.baseVersion + 1 })}</Tag>
      </div>
      {state.pendingRestartConsumers.length > 0 ? (
        <Alert
          message={t("configuration.restartPending", {
            consumers: state.pendingRestartConsumers.join(", "),
          })}
          showIcon
          type="warning"
        />
      ) : null}
      <Form layout="vertical">
        <Collapse defaultActiveKey={groups.map((group) => group.key)} items={groups} />
      </Form>

      <Modal
        cancelText={t("common.cancel")}
        confirmLoading={pending}
        okText={t("configuration.confirmPublish")}
        open={publishOpen}
        title={t("configuration.publishTitle")}
        onCancel={() => setPublishOpen(false)}
        onOk={() => void publishConfiguration()}
      >
        <p>{t("configuration.publishDescription")}</p>
        <ChangeSummary entries={immediate} title={t("configuration.immediateChanges")} labelFor={labelFor} />
        <ChangeSummary entries={restart} title={t("configuration.restartChanges")} labelFor={labelFor} />
      </Modal>

      <ConfigurationHistory
        canRollback={canRollback}
        fieldLabel={labelFor}
        items={history}
        loading={historyLoading}
        open={historyOpen}
        text={{
          active: t("configuration.active"),
          author: t("configuration.author"),
          close: t("common.close"),
          configuredSecret: t("configuration.secretOperation"),
          details: t("common.details"),
          empty: t("configuration.historyEmpty"),
          history: t("configuration.history"),
          prepareRollback: t("configuration.prepareRollback"),
          publishedAt: t("configuration.publishedAt"),
          revisionDetails: (version) => t("configuration.revisionDetails", { version }),
          version: (version) => t("configuration.version", { version }),
        }}
        onClose={() => setHistoryOpen(false)}
        onPrepareRollback={(revision) => setRollbackRevision(revision)}
      />

      <Modal
        cancelText={t("common.cancel")}
        confirmLoading={pending}
        okButtonProps={{ danger: true }}
        okText={t("configuration.confirmPrepareRollback")}
        open={Boolean(rollbackRevision)}
        title={t("configuration.prepareRollbackTitle")}
        onCancel={() => setRollbackRevision(undefined)}
        onOk={() => void prepareRollback()}
      >
        <p>{t("configuration.prepareRollbackDescription", {
          version: rollbackRevision?.version ?? "",
        })}</p>
      </Modal>
      {reauthModal}
    </AdminPage>
  );
}

function ChangeSummary({
  entries,
  labelFor,
  title,
}: {
  entries: Array<[ConfigKey, ConfigurationFieldChange]>;
  labelFor: (key: string) => string;
  title: string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="admin-stack">
      <strong>{title}</strong>
      {entries.map(([key, change]) => (
        <div key={key}>
          {labelFor(key)} <Tag>{change.operation}</Tag>
        </div>
      ))}
    </div>
  );
}
