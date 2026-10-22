"use client";
import { Button, Modal, Result, Spin } from "antd";
import { useEffect, useEffectEvent, useState } from "react";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fetchPersonalTemplate,
  TemplateRequestError,
} from "@/lib/resume/templates/client";
import type {
  TemplateDetail,
  TemplateSummary,
} from "@/lib/resume/templates/types";
import { useTemplateStyles } from "./styles";
import { templateErrorKey, useTemplateFeedback } from "./useTemplateFeedback";

export function PersonalTemplatePreview({
  template,
  onClose,
  onUse,
  busy,
}: {
  template?: TemplateSummary;
  onClose: () => void;
  onUse: (template: TemplateSummary) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const { styles } = useTemplateStyles();
  const { report } = useTemplateFeedback();
  const [response, setResponse] = useState<{
    key: string;
    detail?: TemplateDetail;
    error?: unknown;
  }>();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([template?.id, template?.version, attempt]);
  const detail = response?.key === key ? response.detail : undefined;
  const error = response?.key === key ? response.error : undefined;
  const reportAuth = useEffectEvent(report);
  useEffect(() => {
    let active = true;
    if (!template) return;
    void fetchPersonalTemplate(template.id)
      .then((value) => {
        if (!active) return;
        setResponse({ key, detail: value });
      })
      .catch((failure: unknown) => {
        if (active) {
          setResponse({ key, error: failure });
          if (
            failure instanceof TemplateRequestError &&
            failure.code === "unauthorized"
          )
            reportAuth(failure);
        }
      });
    return () => {
      active = false;
    };
  }, [template, key]);
  return (
    <Modal
      open={Boolean(template)}
      centered
      title={detail?.name ?? template?.name}
      width={960}
      onCancel={onClose}
      footer={
        <div className={styles.actions}>
          <Button onClick={onClose}>{t("personalTemplates.cancel")}</Button>
          <Button
            type="primary"
            disabled={!detail || Boolean(error)}
            loading={busy}
            onClick={() => {
              if (detail) onUse(detail);
            }}
          >
            {t("dashboard.templatePicker.use")}
          </Button>
        </div>
      }
    >
      {error ? (
        <Result
          status="error"
          title={t(templateErrorKey(error))}
          extra={
            <Button onClick={() => setAttempt((value) => value + 1)}>
              {t("personalTemplates.retry")}
            </Button>
          }
        />
      ) : detail ? (
        <div className={styles.stage} data-style-scope="template-preview">
          <ResumeRenderer document={detail.document} mode="view" />
        </div>
      ) : (
        <Spin />
      )}
    </Modal>
  );
}
