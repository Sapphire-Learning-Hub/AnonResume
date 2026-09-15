"use client";

import { Button, Input, Modal, Pagination, Segmented, Select, Spin, Tag } from "antd";
import { createStyles } from "antd-style";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import { SearchIcon } from "@/components/ui/InlineIcons";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import {
  filterResumeFontPresets,
  type ResumeFontCategory,
  type ResumeFontPreset,
} from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult } from "@/lib/shared/pagination";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import { fetchResumeEntriesPage } from "@/lib/resume/client";

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
    content-visibility: auto;
    contain-intrinsic-size: auto 248px;
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
  previewSlot: css`
    display: grid;
    min-height: 96px;
    align-items: center;
  `,
  preview: css`
    display: -webkit-box;
    grid-area: 1 / 1;
    overflow: hidden;
    color: ${token.colorText};
    font-size: 26px;
    font-weight: 500;
    line-height: 1.38;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;

    &[data-font-ready="false"] {
      visibility: hidden;
    }
  `,
  previewLoading: css`
    display: flex;
    grid-area: 1 / 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: ${token.colorTextTertiary};
    font-size: 12px;
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

const emptyResumePage: PageResult<ResumeCatalogEntry> = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

export function FontMarket() {
  const { styles } = useStyles();
  const { t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontMarketCategory>("all");
  const [previewText, setPreviewText] = useState(t("fontMarket.defaultPreview"));
  const [selectedPreset, setSelectedPreset] = useState<ResumeFontPreset>();
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [resumePage, setResumePage] = useState(emptyResumePage);
  const [resumePageNumber, setResumePageNumber] = useState(1);
  const [resumeQuery, setResumeQuery] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [activePreviewIds, setActivePreviewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [readyPreviewTextById, setReadyPreviewTextById] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const fontListRef = useRef<HTMLDivElement>(null);
  const loadingPreviewKeysRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const deferredQuery = useDeferredValue(query);
  const deferredPreviewText = useDeferredValue(
    previewText || t("fontMarket.defaultPreview"),
  );
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const fontList = fontListRef.current;
    if (!fontList) return;

    const previews = Array.from(
      fontList.querySelectorAll<HTMLElement>("[data-font-preview-id]"),
    );

    if (typeof IntersectionObserver === "undefined") {
      setActivePreviewIds((current) => {
        const next = new Set(current);
        let changed = false;
        previews.forEach((preview) => {
          const id = preview.dataset.fontPreviewId;
          if (id && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : current;
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const intersectingEntries = entries.filter(
          (entry) => entry.isIntersecting,
        );
        if (intersectingEntries.length === 0) return;

        setActivePreviewIds((current) => {
          const next = new Set(current);
          let changed = false;
          intersectingEntries.forEach((entry) => {
            const id = (entry.target as HTMLElement).dataset.fontPreviewId;
            if (id && !next.has(id)) {
              next.add(id);
              changed = true;
            }
          });
          return changed ? next : current;
        });
        intersectingEntries.forEach((entry) => observer.unobserve(entry.target));
      },
      {
        root: fontList,
        rootMargin: "240px 0px",
      },
    );

    previews.forEach((preview) => {
      if (!activePreviewIds.has(preview.dataset.fontPreviewId ?? "")) {
        observer.observe(preview);
      }
    });

    return () => observer.disconnect();
  }, [activePreviewIds, category, deferredQuery]);

  useEffect(() => {
    const fontList = fontListRef.current;
    if (!fontList) return;

    const activePreviews = Array.from(
      fontList.querySelectorAll<HTMLElement>("[data-font-preview-id]"),
    ).filter((preview) =>
      activePreviewIds.has(preview.dataset.fontPreviewId ?? ""),
    );

    if (!("fonts" in document) || typeof document.fonts.load !== "function") {
      setReadyPreviewTextById((current) => {
        const next = new Map(current);
        let changed = false;
        activePreviews.forEach((preview) => {
          const id = preview.dataset.fontPreviewId;
          if (id && next.get(id) !== deferredPreviewText) {
            next.set(id, deferredPreviewText);
            changed = true;
          }
        });
        return changed ? next : current;
      });
      return;
    }

    activePreviews.forEach((preview) => {
      const id = preview.dataset.fontPreviewId;
      const fontLoadFamily = preview.dataset.fontLoadFamily;
      if (!id || !fontLoadFamily) return;
      if (readyPreviewTextById.get(id) === deferredPreviewText) return;

      const loadingKey = `${id}\u0000${deferredPreviewText}`;
      if (loadingPreviewKeysRef.current.has(loadingKey)) return;
      loadingPreviewKeysRef.current.add(loadingKey);

      void document.fonts
        .load(`500 26px ${fontLoadFamily}`, deferredPreviewText)
        .catch(() => [])
        .then(() => {
          loadingPreviewKeysRef.current.delete(loadingKey);
          if (!mountedRef.current) return;

          setReadyPreviewTextById((current) => {
            if (current.get(id) === deferredPreviewText) return current;
            const next = new Map(current);
            next.set(id, deferredPreviewText);
            return next;
          });
        });
    });
  }, [activePreviewIds, deferredPreviewText, readyPreviewTextById]);

  useEffect(() => {
    if (!selectedPreset) return;

    let active = true;
    void fetchResumeEntriesPage({
      page: resumePageNumber,
      pageSize: 10,
      query: resumeQuery,
    })
      .then((result) => {
        if (!active) return;
        setResumePage(result);
        setSelectedResumeId((current) =>
          result.items.some((resume) => resume.id === current)
            ? current
            : result.items[0]?.id ?? "",
        );
      })
      .catch(() => {
        if (!active) return;
        setResumePage(emptyResumePage);
        setSelectedResumeId("");
      })
      .finally(() => {
        if (active) setResumeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resumePageNumber, resumeQuery, selectedPreset]);

  function openApplyDialog(preset: ResumeFontPreset) {
    setResumePage(emptyResumePage);
    setResumePageNumber(1);
    setResumeQuery("");
    setResumeLoading(true);
    setSelectedPreset(preset);
    setSelectedResumeId("");
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
              ref={fontListRef}
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

                <div className={styles.previewSlot}>
                  <div
                    className={styles.preview}
                    data-font-load-family={preset.fontLoadFamily}
                    data-font-preview-id={preset.id}
                    data-font-ready={
                      readyPreviewTextById.get(preset.id) === deferredPreviewText
                    }
                    data-testid={`font-preview-${preset.id}`}
                    style={
                      activePreviewIds.has(preset.id)
                        ? { fontFamily: preset.resolvedFontFamily }
                        : undefined
                    }
                  >
                    {deferredPreviewText}
                  </div>
                  {readyPreviewTextById.get(preset.id) !== deferredPreviewText ? (
                    <div
                      aria-live="polite"
                      className={styles.previewLoading}
                      data-testid={`font-preview-loading-${preset.id}`}
                      role="status"
                    >
                      <Spin size="small" />
                      <span>{t("fontMarket.previewLoading")}</span>
                    </div>
                  ) : null}
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
          resumeLoading && resumePage.items.length === 0 ? (
            <Spin />
          ) : resumePage.total > 0 || resumeQuery ? (
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
                  filterOption={false}
                  loading={resumeLoading}
                  onChange={setSelectedResumeId}
                  onSearch={(value) => {
                    setResumeLoading(true);
                    setResumePageNumber(1);
                    setResumeQuery(value.trim());
                  }}
                  options={resumePage.items.map((resume) => ({
                    label: resume.title,
                    value: resume.id,
                  }))}
                  placeholder={t("dashboard.searchResumePlaceholder")}
                  showSearch
                  value={selectedResumeId}
                />
                {resumePage.totalPages > 1 ? (
                  <Pagination
                    current={resumePage.page}
                    pageSize={resumePage.pageSize}
                    showSizeChanger={false}
                    total={resumePage.total}
                    onChange={(page) => {
                      setResumeLoading(true);
                      setResumePageNumber(page);
                    }}
                  />
                ) : null}
              </label>
              <div className={styles.modalActions}>
                <Button htmlType="button" onClick={() => setSelectedPreset(undefined)}>
                  {t("common.dismiss")}
                </Button>
                <Button disabled={!selectedResumeId} htmlType="submit" type="primary">
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
