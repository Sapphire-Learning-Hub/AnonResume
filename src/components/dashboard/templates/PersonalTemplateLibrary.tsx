"use client";
import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown, Empty, Input, Modal, Result, Spin } from "antd";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { useI18n } from "@/i18n/I18nProvider";
import {
  deletePersonalTemplateRequest,
  fetchPersonalTemplate,
  instantiatePersonalTemplateRequest,
  renamePersonalTemplateRequest,
} from "@/lib/resume/templates/client";
import type {
  TemplateDetail,
  TemplateSummary,
} from "@/lib/resume/templates/types";
import { PersonalTemplatePreview } from "./PersonalTemplatePreview";
import { usePersonalTemplates } from "./usePersonalTemplates";
import { useTemplateStyles } from "./styles";
import { templateErrorKey, useTemplateFeedback } from "./useTemplateFeedback";

function Thumbnail({ template }: { template: TemplateSummary }) {
  const { styles } = useTemplateStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<TemplateDetail>();
  const document =
    loaded?.id === template.id && loaded.version === template.version
      ? loaded.document
      : undefined;
  useEffect(() => {
    let active = true;
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void fetchPersonalTemplate(template.id)
        .then((value) => {
          if (active && value.version === template.version) setLoaded(value);
        })
        .catch(() => {});
    });
    observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [template.id, template.version]);
  return (
    <div aria-hidden="true" className={styles.thumbnail} ref={ref}>
      {document ? (
        <div className={styles.document}>
          <ResumeRenderer document={document} mode="view" zoom={0.245} />
        </div>
      ) : null}
    </div>
  );
}

export function PersonalTemplateLibrary({ query }: { query: string }) {
  const { locale, t } = useI18n();
  const { styles } = useTemplateStyles();
  const { report, toast } = useTemplateFeedback();
  const library = usePersonalTemplates(query);
  const access = useEditorViewportAccess();
  const [preview, setPreview] = useState<TemplateSummary>();
  const [deleting, setDeleting] = useState<TemplateSummary>();
  const [renaming, setRenaming] = useState<TemplateSummary>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingId, setCreatingId] = useState<string>();
  const operation = useRef<{ id: string; version: number; key: string } | null>(
    null,
  );
  const authError = library.error;
  const reportAuth = useEffectEvent(report);
  useEffect(() => {
    if (authError && templateErrorKey(authError) === "personalTemplates.signIn")
      reportAuth(authError);
  }, [authError]);
  async function createFromTemplate(template: TemplateSummary) {
    if (busy) return;
    setBusy(true);
    setCreatingId(template.id);
    if (
      operation.current?.id !== template.id ||
      operation.current.version !== template.version
    )
      operation.current = {
        id: template.id,
        version: template.version,
        key: crypto.randomUUID(),
      };
    try {
      const result = await instantiatePersonalTemplateRequest(
        template.id,
        template.version,
        operation.current.key,
      );
      window.location.assign(
        access === "allowed" ? `/app/resumes/${result.resumeId}` : "/app",
      );
    } catch (error) {
      report(error);
      library.refresh();
    } finally {
      setBusy(false);
      setCreatingId(undefined);
    }
  }
  async function deleteTemplate() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await deletePersonalTemplateRequest(deleting.id, deleting.version);
      setDeleting(undefined);
      library.refresh();
      toast.success({
        content: t("personalTemplates.deleted"),
        key: "personal-template-operation",
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function renameTemplate() {
    if (
      !renaming ||
      busy ||
      !name.trim() ||
      Array.from(name.trim()).length > 100
    )
      return;
    setBusy(true);
    try {
      await renamePersonalTemplateRequest(renaming.id, renaming.version, name);
      setRenaming(undefined);
      library.refresh();
      toast.success({
        content: t("personalTemplates.updated"),
        key: "personal-template-operation",
      });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {library.error ? (
        <Result
          status="error"
          title={t(templateErrorKey(library.error))}
          extra={
            <Button onClick={library.refresh}>
              {t("personalTemplates.retry")}
            </Button>
          }
        />
      ) : null}
      {!library.busy && !library.error && library.page.items.length === 0 ? (
        <Empty
          description={
            query.trim() ? (
              t("personalTemplates.noResults")
            ) : (
              <>
                <div>{t("personalTemplates.empty")}</div>
                <div>{t("personalTemplates.emptyHint")}</div>
              </>
            )
          }
        />
      ) : null}
      <div className={styles.grid}>
        {library.page.items.map((template) => (
          <article
            className={styles.card}
            key={template.id}
            aria-label={template.name}
          >
            <Thumbnail template={template} />
            <div className={styles.meta}>
              <span className={styles.name}>{template.name}</span>
              <span className={styles.date}>
                {t("personalTemplates.updatedAt", {
                  date: new Date(template.updatedAt).toLocaleDateString(locale),
                })}
              </span>
              <div className={styles.actions}>
                <Button onClick={() => setPreview(template)}>
                  {t("common.preview")}
                </Button>
                <Button
                  type="primary"
                  loading={busy && creatingId === template.id}
                  disabled={busy}
                  onClick={() => void createFromTemplate(template)}
                >
                  {t("dashboard.templatePicker.use")}
                </Button>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      { key: "rename", label: t("personalTemplates.rename") },
                      {
                        key: "delete",
                        label: t("personalTemplates.delete"),
                        danger: true,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === "rename") {
                        setRenaming(template);
                        setName(template.name);
                      } else setDeleting(template);
                    },
                  }}
                >
                  <Button
                    icon={<MoreOutlined />}
                    aria-label={t("dashboard.moreActions", {
                      title: template.name,
                    })}
                    disabled={busy}
                  />
                </Dropdown>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className={styles.more}>
        {library.busy ? (
          <Spin />
        ) : library.page.nextCursor ? (
          <Button onClick={() => void library.more()}>
            {t("personalTemplates.more")}
          </Button>
        ) : null}
      </div>
      <PersonalTemplatePreview
        template={preview}
        onClose={() => setPreview(undefined)}
        onUse={(template) => void createFromTemplate(template)}
        busy={busy}
      />
      <Modal
        open={Boolean(deleting)}
        title={t("personalTemplates.confirmDelete")}
        onCancel={() => setDeleting(undefined)}
        onOk={() => void deleteTemplate()}
        confirmLoading={busy}
        okButtonProps={{ danger: true }}
        okText={t("personalTemplates.delete")}
        cancelText={t("personalTemplates.cancel")}
      >
        {t("personalTemplates.deleteNotice")}
      </Modal>
      <Modal
        open={Boolean(renaming)}
        title={t("personalTemplates.rename")}
        onCancel={() => setRenaming(undefined)}
        onOk={() => void renameTemplate()}
        confirmLoading={busy}
        okButtonProps={{
          disabled: !name.trim() || Array.from(name.trim()).length > 100,
        }}
        okText={t("personalTemplates.confirm")}
        cancelText={t("personalTemplates.cancel")}
      >
        <label className={styles.field}>
          <span>{t("personalTemplates.name")}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onPressEnter={() => void renameTemplate()}
          />
        </label>
      </Modal>
    </>
  );
}
