"use client";

import { DiffOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useState } from "react";

import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

import { EditorFloatingNotice } from "./EditorFloatingNotice";
import { ResumeDocumentDiffModal } from "./ResumeDocumentDiffModal";

export function ResumeVersionDiffPrompt({
  kind,
  description,
  cloudDocument,
  localDocument,
  loading = false,
  error = false,
  onUseCloud,
  onUseLocal,
}: {
  kind: "recovery" | "conflict";
  description: string;
  cloudDocument?: ResumeDocument;
  localDocument: ResumeDocument;
  loading?: boolean;
  error?: boolean;
  onUseCloud: () => void | Promise<void>;
  onUseLocal: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [diffOpen, setDiffOpen] = useState(false);
  const title = kind === "recovery"
    ? t("editor.recoveryTitle")
    : t("editor.conflictTitle");

  return (
    <>
      <EditorFloatingNotice
        actions={
          <>
            <Button
              disabled={loading || error || !cloudDocument}
              icon={<DiffOutlined aria-hidden="true" />}
              loading={loading}
              size="small"
              onClick={() => setDiffOpen(true)}
            >
              {t("editor.diff.view")}
            </Button>
            <Button size="small" onClick={onUseCloud}>
              {t("editor.useCloudVersion")}
            </Button>
            <Button type="primary" size="small" onClick={onUseLocal}>
              {t("editor.restoreLocalVersion")}
            </Button>
          </>
        }
        ariaLabel={kind === "recovery"
          ? t("editor.recoveryAriaLabel")
          : t("editor.conflictAriaLabel")}
        description={description}
        title={title}
      />

      <ResumeDocumentDiffModal
        error={error}
        errorMessage={t("editor.diff.loadError")}
        footer={[
          <Button key="close" onClick={() => setDiffOpen(false)}>
            {t("common.dismiss")}
          </Button>,
          <Button key="cloud" onClick={onUseCloud}>
            {t("editor.useCloudVersion")}
          </Button>,
          <Button key="local" type="primary" onClick={onUseLocal}>
            {t("editor.restoreLocalVersion")}
          </Button>,
        ]}
        loading={loading}
        loadingMessage={t("editor.diff.loading")}
        open={diffOpen}
        sourceDocument={cloudDocument}
        sourceLabel={t("editor.diff.cloudVersion")}
        targetDocument={localDocument}
        targetLabel={t("editor.diff.localVersion")}
        title={t("editor.diff.title")}
        onCancel={() => setDiffOpen(false)}
      />
    </>
  );
}
