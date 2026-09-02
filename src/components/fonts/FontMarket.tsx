"use client";

import { Button, Input, Modal, Segmented, Select, Tag } from "antd";
import { createStyles } from "antd-style";
import { useDeferredValue, useState } from "react";

import { SearchIcon } from "@/components/ui/InlineIcons";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import {
  filterResumeFontPresets,
  type ResumeFontCategory,
  type ResumeFontPreset,
} from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";
import type { ResumeCatalogEntry } from "@/lib/resume-catalog";

type FontMarketCategory = ResumeFontCategory | "all";

const useStyles = createStyles(({ token, css }) => ({
  market: css`
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
  `,
  pageHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    gap: 24px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 720px) {
      min-height: 58px;
    }
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  `,
  controls: css`
    display: grid;
    grid-template-columns: minmax(240px, 360px) minmax(320px, 1fr);
    align-items: end;
    gap: 16px;
    padding: 20px 0 14px;

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  `,
  catalog: css`
    display: grid;
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  `,
  field: css`
    display: grid;
    min-width: 0;
    gap: 7px;
  `,
  fieldLabel: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    font-weight: 500;
  `,
  search: css`
    && {
      width: 100%;
    }
  `,
  previewInput: css`
    && {
      resize: none;
    }
  `,
  filterBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 16px;

    @media (max-width: 720px) {
      align-items: stretch;
      flex-direction: column;
    }
  `,
  categories: css`
    && {
      max-width: 100%;
      overflow-x: auto;
    }
  `,
  count: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    white-space: nowrap;
  `,
  grid: css`
    display: grid;
    align-content: start;
    min-height: 0;
    grid-auto-rows: max-content;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding: 0 4px 40px 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;

    @media (max-width: 1180px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 720px) {
      grid-template-columns: 1fr;
    }
  `,
  card: css`
    display: grid;
    min-width: 0;
    min-height: 248px;
    grid-template-rows: auto minmax(96px, 1fr) auto;
    gap: 16px;
    padding: 18px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorBgContainer};
    transition:
      border-color 140ms ease,
      box-shadow 140ms ease;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: 0 8px 24px ${token.colorFillSecondary};
    }
  `,
  cardHeader: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    min-width: 0;
    gap: 12px;
  `,
  fontIdentity: css`
    display: grid;
    min-width: 0;
    gap: 3px;
  `,
  fontName: css`
    overflow: hidden;
    margin: 0;
    color: ${token.colorText};
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fontDescription: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.45;
  `,
  preview: css`
    display: -webkit-box;
    overflow: hidden;
    color: ${token.colorText};
    font-size: 26px;
    font-weight: 500;
    line-height: 1.38;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  `,
  cardFooter: css`
    display: grid;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  metadata: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;

    .ant-tag {
      margin: 0;
    }
  `,
  actions: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  sourceLink: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;

    &:hover {
      color: ${token.colorPrimary};
    }
  `,
  empty: css`
    grid-column: 1 / -1;
    padding: 64px 24px;
    border: 1px dashed ${token.colorBorder};
    border-radius: 10px;
    color: ${token.colorTextTertiary};
    text-align: center;
  `,
  modalBody: css`
    display: grid;
    gap: 20px;
  `,
  modalField: css`
    display: grid;
    gap: 8px;
  `,
  modalActions: css`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 4px;
  `,
}));

export function FontMarket({
  resumes,
}: {
  resumes: ResumeCatalogEntry[];
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontMarketCategory>("all");
  const [previewText, setPreviewText] = useState(t("fontMarket.defaultPreview"));
  const [selectedPreset, setSelectedPreset] = useState<ResumeFontPreset>();
  const [selectedResumeId, setSelectedResumeId] = useState(resumes[0]?.id ?? "");
  const deferredQuery = useDeferredValue(query);
  const filteredPresets = filterResumeFontPresets(deferredQuery, {
    category,
    getCategoryLabel: (value) => t(`fontMarket.category.${value}`),
    getDescription: (preset) => t(preset.descriptionKey),
    getScriptLabel: (script) => t(`fontMarket.script.${script}`),
  });
  const categoryOptions: { label: string; value: FontMarketCategory }[] = [
    { label: t("fontMarket.category.all"), value: "all" },
    { label: t("fontMarket.category.sans"), value: "sans" },
    { label: t("fontMarket.category.serif"), value: "serif" },
    { label: t("fontMarket.category.mono"), value: "mono" },
    { label: t("fontMarket.category.handwriting"), value: "handwriting" },
  ];

  function openApplyDialog(preset: ResumeFontPreset) {
    setSelectedPreset(preset);
    setSelectedResumeId((current) => current || resumes[0]?.id || "");
  }

  return (
    <>
      <div className={styles.market}>
          <section className={styles.pageHeader}>
            <h1 className={styles.heading}>{t("fontMarket.heading")}</h1>
          </section>

          <section
            aria-label={t("fontMarket.heading")}
            className={styles.catalog}
          >
            <div className={styles.controls}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("fontMarket.search")}</span>
            <Input
              allowClear
              aria-label={t("fontMarket.search")}
              className={styles.search}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("fontMarket.searchPlaceholder")}
              prefix={<SearchIcon size={16} />}
              type="search"
              value={query}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t("fontMarket.previewText")}</span>
            <Input.TextArea
              aria-label={t("fontMarket.previewText")}
              className={styles.previewInput}
              data-testid="font-preview-input"
              onChange={(event) => setPreviewText(event.target.value)}
              placeholder={t("fontMarket.previewPlaceholder")}
              rows={1}
              value={previewText}
            />
          </label>
            </div>

            <div className={styles.filterBar}>
          <Segmented<FontMarketCategory>
            aria-label={t("fontMarket.heading")}
            className={styles.categories}
            onChange={setCategory}
            options={categoryOptions}
            value={category}
          />
          <span aria-live="polite" className={styles.count}>
            {t("fontMarket.resultCount", { count: filteredPresets.length })}
          </span>
            </div>

            <div
              className={styles.grid}
              data-testid="font-market-list"
            >
          {filteredPresets.length === 0 ? (
            <div className={styles.empty}>{t("fontMarket.noResults")}</div>
          ) : (
            filteredPresets.map((preset) => (
              <article className={styles.card} data-testid="font-market-card" key={preset.id}>
                <header className={styles.cardHeader}>
                  <div className={styles.fontIdentity}>
                    <h2 className={styles.fontName}>{preset.name}</h2>
                    <span className={styles.fontDescription}>
                      {t(preset.descriptionKey)}
                    </span>
                  </div>
                  <Tag>{t(`fontMarket.category.${preset.category}`)}</Tag>
                </header>

                <div
                  className={styles.preview}
                  data-testid={`font-preview-${preset.id}`}
                  style={{ fontFamily: preset.resolvedFontFamily }}
                >
                  {previewText || t("fontMarket.defaultPreview")}
                </div>

                <footer className={styles.cardFooter}>
                  <div className={styles.metadata}>
                    {preset.scripts.map((script) => (
                      <Tag key={script}>{t(`fontMarket.script.${script}`)}</Tag>
                    ))}
                    <Tag color="success">{t("fontMarket.license")}</Tag>
                  </div>
                  <div className={styles.actions}>
                    <a
                      className={styles.sourceLink}
                      href={preset.source}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("fontMarket.source")}
                    </a>
                    <Button onClick={() => openApplyDialog(preset)} type="primary">
                      {t("fontMarket.apply")}
                    </Button>
                  </div>
                </footer>
              </article>
            ))
          )}
            </div>
          </section>
      </div>

      <Modal
        footer={null}
        onCancel={() => setSelectedPreset(undefined)}
        open={Boolean(selectedPreset)}
        title={
          selectedPreset
            ? t("fontMarket.applyTitle", { font: selectedPreset.name })
            : undefined
        }
      >
        {selectedPreset ? (
          resumes.length > 0 ? (
            <form
              action={`/app/resumes/${selectedResumeId}/font`}
              className={styles.modalBody}
              data-testid="apply-font-form"
              method="post"
            >
              <input name="fontPresetId" type="hidden" value={selectedPreset.id} />
              <input
                name="returnTo"
                type="hidden"
                value={
                  editorAccess === "allowed"
                    ? `/app/resumes/${selectedResumeId}`
                    : "/app/fonts"
                }
              />
              <label className={styles.modalField}>
                <span className={styles.fieldLabel}>{t("fontMarket.targetResume")}</span>
                <Select
                  aria-label={t("fontMarket.targetResume")}
                  onChange={setSelectedResumeId}
                  options={resumes.map((resume) => ({
                    label: resume.title,
                    value: resume.id,
                  }))}
                  value={selectedResumeId}
                />
              </label>
              <div className={styles.modalActions}>
                <Button htmlType="button" onClick={() => setSelectedPreset(undefined)}>
                  {t("common.dismiss")}
                </Button>
                <Button htmlType="submit" type="primary">
                  {t("fontMarket.confirmApply")}
                </Button>
              </div>
            </form>
          ) : (
            <div className={styles.modalBody}>
              <p>{t("fontMarket.noResumes")}</p>
              <div className={styles.modalActions}>
                <Button href="/app" type="primary">
                  {t("common.createResume")}
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Modal>
    </>
  );
}
