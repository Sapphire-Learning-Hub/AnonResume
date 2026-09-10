"use client";

import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Input, Modal } from "antd";
import { createStyles } from "antd-style";
import { useDeferredValue, useState } from "react";

import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import {
  listResumeTemplates,
  resumeTemplateCollectionIds,
  type ResumeTemplate,
  type ResumeTemplateCollectionId,
} from "@/domain/resume/templates";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";

const CARD_PREVIEW_SCALE = 0.245;

const collectionNameKeys = {
  all: "dashboard.templatePicker.collection.all",
  recommended: "dashboard.templatePicker.collection.recommended",
  minimal: "dashboard.templatePicker.collection.minimal",
  classic: "dashboard.templatePicker.collection.classic",
  structured: "dashboard.templatePicker.collection.structured",
  compact: "dashboard.templatePicker.collection.compact",
} as const satisfies Record<ResumeTemplateCollectionId, MessageKey>;

const useStyles = createStyles(({ token, css }) => ({
  marketModal: css`
    && {
      max-width: calc(100vw - 32px);
      padding-bottom: 0;
    }
  `,
  marketContainer: css`
    && {
      display: flex;
      height: min(840px, calc(100vh - 64px));
      max-height: calc(100vh - 64px);
      flex-direction: column;
      overflow: hidden;
      padding: 0;
    }

    @media (max-width: 720px) {
      && {
        height: calc(100vh - 24px);
        max-height: calc(100vh - 24px);
      }
    }
  `,
  marketHeader: css`
    && {
      margin: 0;
      padding: 16px 56px 16px 24px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  marketBody: css`
    && {
      min-height: 0;
      flex: 1;
      overflow: hidden;
      padding: 0;
    }
  `,
  titleBar: css`
    display: grid;
    grid-template-columns: minmax(170px, 1fr) minmax(280px, 460px) minmax(170px, 1fr);
    align-items: center;
    gap: 24px;

    @media (max-width: 760px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
  `,
  title: css`
    color: ${token.colorText};
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  `,
  search: css`
    && {
      width: 100%;
      min-height: 36px;
      border-radius: 6px;
    }
  `,
  marketLayout: css`
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-columns: 190px minmax(0, 1fr);

    @media (max-width: 720px) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
  `,
  sidebar: css`
    min-height: 0;
    padding: 24px 14px;
    overflow-y: auto;
    border-right: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};

    @media (max-width: 720px) {
      display: flex;
      padding: 10px 12px;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  sidebarHeading: css`
    margin: 0 10px 12px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;

    @media (max-width: 720px) {
      display: none;
    }
  `,
  categoryList: css`
    display: grid;
    gap: 3px;

    @media (max-width: 720px) {
      display: flex;
      gap: 6px;
    }
  `,
  categoryButton: css`
    && {
      display: flex;
      width: 100%;
      height: 34px;
      justify-content: flex-start;
      padding-inline: 12px;
      border-radius: 5px;
      color: ${token.colorTextSecondary};
      font-weight: 500;

      &[data-active="true"] {
        background: ${token.colorPrimaryBg};
        color: ${token.colorPrimary};
      }

      @media (max-width: 720px) {
        width: auto;
        flex: 0 0 auto;
        white-space: nowrap;
      }
    }
  `,
  content: css`
    min-width: 0;
    min-height: 0;
    padding: 24px;
    overflow-y: auto;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      padding: 18px 14px;
    }
  `,
  resultHeader: css`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 16px;
  `,
  resultTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
  `,
  resultCount: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    white-space: nowrap;
  `,
  templateGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(226px, 1fr));
    gap: 18px;

    @media (max-width: 560px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  templateCard: css`
    min-width: 0;
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 7px;
    background: ${token.colorBgContainer};
    box-shadow: ${token.boxShadowTertiary};
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;

    &:hover,
    &:focus-within {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: ${token.boxShadowSecondary};
      transform: translateY(-2px);
    }

    &:focus-within {
      box-shadow: inset 0 0 0 2px ${token.colorPrimaryBorder}, ${token.boxShadowSecondary};
    }
  `,
  previewViewport: css`
    position: relative;
    display: grid;
    height: 292px;
    overflow: hidden;
    place-items: center;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
    pointer-events: none;

    [data-print-chrome="screen"] {
      display: none;
    }

    &[data-blank="true"] {
      background: ${token.colorBgContainer};
    }
  `,
  previewDocument: css`
    position: absolute;
    top: 12px;
    left: 50%;
    width: 210mm;
    margin-left: -105mm;
    transform: scale(${CARD_PREVIEW_SCALE});
    transform-origin: top center;

    [data-resume-page="true"] {
      box-shadow: ${token.boxShadowSecondary};
    }
  `,
  blankMark: css`
    display: grid;
    width: 62px;
    height: 62px;
    place-items: center;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: 50%;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 26px;
  `,
  cardMeta: css`
    display: grid;
    padding: 14px;
    gap: 8px;
  `,
  cardTitleRow: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  `,
  cardTitle: css`
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: ${token.colorText};
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  recommendedBadge: css`
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 4px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
  `,
  cardDescription: css`
    min-height: 36px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.5;
  `,
  cardActions: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    form {
      display: contents;
    }

    .ant-btn {
      width: 100%;
      border-radius: 5px;
    }
  `,
  emptyState: css`
    display: grid;
    min-height: 360px;
    place-items: center;
    color: ${token.colorTextTertiary};
    font-size: 14px;
    text-align: center;
  `,
  previewModalBody: css`
    && {
      max-height: calc(100vh - 190px);
      padding: 0;
      overflow: auto;
      background: ${token.colorBgLayout};
    }
  `,
  previewStage: css`
    width: max-content;
    min-width: 100%;
    padding: 24px;

    [data-print-chrome="screen"] {
      display: none;
    }
  `,
  previewFooter: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  `,
}));

function TemplateCreationFields({
  returnTo,
  template,
}: {
  returnTo: string;
  template: ResumeTemplate;
}) {
  return (
    <>
      <input name="templateId" type="hidden" value={template.id} />
      <input name="returnTo" type="hidden" value={returnTo} />
    </>
  );
}

export function ResumeTemplatePicker({
  createAction,
  onClose,
  open,
}: {
  createAction: string;
  onClose: () => void;
  open: boolean;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [activeCollection, setActiveCollection] =
    useState<ResumeTemplateCollectionId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplateId, setPreviewTemplateId] = useState<string>();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const templates = listResumeTemplates(locale);
  const returnTo = editorAccess === "allowed" ? "editor" : "/app";
  const normalizedQuery = deferredSearchQuery.trim().toLocaleLowerCase(locale);
  const filteredTemplates = templates.filter((template) => {
    const matchesCollection =
      activeCollection === "all" ||
      template.collectionIds.some((id) => id === activeCollection);
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        t(template.nameKey),
        t(template.descriptionKey),
        ...template.searchKeywords,
      ]
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(normalizedQuery);

    return matchesCollection && matchesQuery;
  });
  const previewTemplate = templates.find(
    (template) => template.id === previewTemplateId,
  );
  const activeCollectionName = t(collectionNameKeys[activeCollection]);

  function resetMarket() {
    setActiveCollection("all");
    setSearchQuery("");
    setPreviewTemplateId(undefined);
  }

  return (
    <>
      <Modal
        afterOpenChange={(visible) => {
          if (!visible) {
            resetMarket();
          }
        }}
        centered
        className={styles.marketModal}
        classNames={{
          body: styles.marketBody,
          container: styles.marketContainer,
          header: styles.marketHeader,
        }}
        closable={{ "aria-label": t("dashboard.templatePicker.close") }}
        destroyOnHidden
        footer={null}
        onCancel={onClose}
        open={open}
        title={
          <div className={styles.titleBar}>
            <span className={styles.title}>
              {t("dashboard.templatePicker.title")}
            </span>
            <Input
              allowClear
              aria-label={t("dashboard.templatePicker.search")}
              className={styles.search}
              placeholder={t("dashboard.templatePicker.searchPlaceholder")}
              prefix={<SearchOutlined />}
              role="searchbox"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <span aria-hidden="true" />
          </div>
        }
        width={1400}
      >
        <div className={styles.marketLayout}>
          <nav
            aria-label={t("dashboard.templatePicker.navigation")}
            className={styles.sidebar}
          >
            <h2 className={styles.sidebarHeading}>
              {t("dashboard.templatePicker.browse")}
            </h2>
            <div className={styles.categoryList}>
              {resumeTemplateCollectionIds.map((collectionId) => (
                <Button
                  aria-pressed={activeCollection === collectionId}
                  className={styles.categoryButton}
                  data-active={activeCollection === collectionId}
                  key={collectionId}
                  type="text"
                  onClick={() => setActiveCollection(collectionId)}
                >
                  {t(collectionNameKeys[collectionId])}
                </Button>
              ))}
            </div>
          </nav>

          <section aria-live="polite" className={styles.content}>
            <header className={styles.resultHeader}>
              <h2 className={styles.resultTitle}>
                {t("dashboard.templatePicker.resultHeading", {
                  collection: activeCollectionName,
                })}
              </h2>
              <span className={styles.resultCount}>
                {t("dashboard.templatePicker.resultCount", {
                  count: filteredTemplates.length,
                })}
              </span>
            </header>

            {filteredTemplates.length > 0 ? (
              <div className={styles.templateGrid}>
                {filteredTemplates.map((template) => {
                  const isBlank = template.id === "blank";
                  const isRecommended =
                    template.collectionIds.includes("recommended");

                  return (
                    <article
                      aria-label={t(template.nameKey)}
                      className={styles.templateCard}
                      key={template.id}
                    >
                      <div
                        aria-hidden="true"
                        className={styles.previewViewport}
                        data-blank={isBlank}
                      >
                        {isBlank ? (
                          <span className={styles.blankMark}>
                            <PlusOutlined />
                          </span>
                        ) : (
                          <div className={styles.previewDocument}>
                            <ResumeRenderer
                              document={template.document}
                              mode="view"
                              zoom={CARD_PREVIEW_SCALE}
                            />
                          </div>
                        )}
                      </div>
                      <div className={styles.cardMeta}>
                        <div className={styles.cardTitleRow}>
                          <span className={styles.cardTitle}>
                            {t(template.nameKey)}
                          </span>
                          {isRecommended ? (
                            <span className={styles.recommendedBadge}>
                              {t("dashboard.templatePicker.recommended")}
                            </span>
                          ) : null}
                        </div>
                        <span className={styles.cardDescription}>
                          {t(template.descriptionKey)}
                        </span>
                        <div className={styles.cardActions}>
                          <Button
                            onClick={() => setPreviewTemplateId(template.id)}
                          >
                            {t("dashboard.templatePicker.preview")}
                          </Button>
                          <form action={createAction} method="post">
                            <TemplateCreationFields
                              returnTo={returnTo}
                              template={template}
                            />
                            <Button htmlType="submit" type="primary">
                              {t("dashboard.templatePicker.use")}
                            </Button>
                          </form>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                {t("dashboard.templatePicker.noResults")}
              </div>
            )}
          </section>
        </div>
      </Modal>

      <Modal
        centered
        classNames={{ body: styles.previewModalBody }}
        destroyOnHidden
        footer={
          previewTemplate ? (
            <form
              action={createAction}
              className={styles.previewFooter}
              method="post"
            >
              <TemplateCreationFields
                returnTo={returnTo}
                template={previewTemplate}
              />
              <Button onClick={() => setPreviewTemplateId(undefined)}>
                {t("dashboard.templatePicker.previewBack")}
              </Button>
              <Button htmlType="submit" type="primary">
                {t("dashboard.templatePicker.confirm")}
              </Button>
            </form>
          ) : null
        }
        onCancel={() => setPreviewTemplateId(undefined)}
        open={Boolean(previewTemplate)}
        title={
          previewTemplate
            ? t("dashboard.templatePicker.previewTitle", {
                name: t(previewTemplate.nameKey),
              })
            : undefined
        }
        width={960}
      >
        {previewTemplate ? (
          <div className={styles.previewStage}>
            <ResumeRenderer document={previewTemplate.document} mode="view" />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
