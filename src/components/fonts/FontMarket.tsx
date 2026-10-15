"use client";

import { Button, Input, Pagination, Select, Spin, Tag } from "antd";
import { createStyles } from "antd-style";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import {
  loadResumeFontAssets,
  ResumeFontAssets,
  type ResumeFontAssetStatus,
} from "@/components/resume/fonts/font-assets";
import { FavoriteIcon, SearchIcon } from "@/components/ui/InlineIcons";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import {
  listResumeFontPresets,
  type ResumeFontPreset,
} from "@/domain/resume/font-presets";
import {
  filterAndSortResumeFontPresets,
  serializeFontMarketQuery,
  usesFallbackForText,
  type FontMarketFilters as FontMarketFilterState,
  type FontMarketQuery,
} from "@/domain/resume/fonts/market";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult } from "@/lib/shared/pagination";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import { fetchResumeEntriesPage } from "@/lib/resume/client";
import { FontMarketFilters } from "./FontMarketFilters";
import { FontDetailDialog } from "./FontDetailDialog";
import { FontCompareDialog } from "./FontCompareDialog";
import { FontDialogFrame } from "./FontDialogFrame";
import { FontCompareTray } from "./FontCompareTray";
import type { FontMarketProps } from "./types";

const defaultMarketQuery: FontMarketQuery = {
  query: "",
  categories: [],
  scripts: [],
  useCases: [],
  sort: "newest",
};

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
  cardHeaderActions: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  `,
  recommendationTag: css`
    && {
      margin-inline-end: 0;
    }
  `,
  favoriteButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
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

export function FontMarket({
  defaultResume,
  initialPreferences = [],
  initialQuery = defaultMarketQuery,
}: FontMarketProps = {}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const editorAccess = useEditorViewportAccess();
  const [query, setQuery] = useState(initialQuery.query);
  const [filters, setFilters] = useState<FontMarketFilterState>({
    categories: initialQuery.categories,
    scripts: initialQuery.scripts,
    useCases: initialQuery.useCases,
    sort: initialQuery.sort,
  });
  const [preferences, setPreferences] = useState(initialPreferences);
  const [previewText, setPreviewText] = useState(
    t("fontMarket.defaultPreview"),
  );
  const [selectedPreset, setSelectedPreset] = useState<ResumeFontPreset>();
  const [applyOpen, setApplyOpen] = useState(false);
  const [detailPreset, setDetailPreset] = useState<ResumeFontPreset>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
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
  const [assetStatuses, setAssetStatuses] = useState<
    ReadonlyMap<string, ResumeFontAssetStatus>
  >(() => new Map());
  const fontListRef = useRef<HTMLDivElement>(null);
  const loadingPreviewKeysRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const deferredQuery = useDeferredValue(query);
  const deferredPreviewText = useDeferredValue(
    previewText || t("fontMarket.defaultPreview"),
  );
  const filteredPresets = filterAndSortResumeFontPresets({
    presets: listResumeFontPresets(),
    filters,
    query: deferredQuery,
    recentUsage: Object.fromEntries(
      preferences.map((preference) => [
        preference.fontPresetId,
        preference.lastAppliedAt ?? 0,
      ]),
    ),
    getSearchMetadata: (preset) => [
      t(preset.descriptionKey),
      t(`fontMarket.category.${preset.category}`),
      ...preset.scripts.map((script) => t(`fontMarket.script.${script}`)),
    ],
  });

  function syncMarketUrl(
    nextQuery: string,
    nextFilters: FontMarketFilterState,
  ) {
    const params = serializeFontMarketQuery({
      query: nextQuery,
      ...nextFilters,
    });
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

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
        intersectingEntries.forEach((entry) =>
          observer.unobserve(entry.target),
        );
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
  }, [activePreviewIds, deferredQuery, filters]);

  async function toggleFavorite(preset: ResumeFontPreset) {
    const previous = preferences;
    const existing = previous.find((item) => item.fontPresetId === preset.id);
    const favorite = !existing?.favorite;
    setPreferences((current) => [
      ...current.filter((item) => item.fontPresetId !== preset.id),
      {
        fontPresetId: preset.id,
        favorite,
        lastAppliedAt: existing?.lastAppliedAt,
      },
    ]);

    try {
      const response = await fetch("/api/account/font-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fontPresetId: preset.id, favorite }),
      });
      if (!response.ok) throw new Error("favorite_failed");
      const payload = (await response.json()) as {
        preferences: typeof preferences;
      };
      setPreferences(payload.preferences);
    } catch {
      setPreferences(previous);
      void toast.error({
        key: `font-favorite-${preset.id}`,
        content: t("fontMarket.favoriteFailed"),
      });
    }
  }

  useEffect(() => {
    const fontList = fontListRef.current;
    if (!fontList) return;

    const activePreviews = Array.from(
      fontList.querySelectorAll<HTMLElement>("[data-font-preview-id]"),
    ).filter((preview) => {
      const id = preview.dataset.fontPreviewId ?? "";
      const preset = listResumeFontPresets().find((item) => item.id === id);
      return (
        activePreviewIds.has(id) &&
        preset !== undefined &&
        assetStatuses.get(preset.assetKey) === "ready"
      );
    });

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
  }, [
    activePreviewIds,
    assetStatuses,
    deferredPreviewText,
    readyPreviewTextById,
  ]);

  useEffect(() => {
    if (!applyOpen || !selectedPreset) return;

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
            : (result.items[0]?.id ?? ""),
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
  }, [applyOpen, resumePageNumber, resumeQuery, selectedPreset]);

  function openApplyDialog(preset: ResumeFontPreset) {
    setResumePage(emptyResumePage);
    setResumePageNumber(1);
    setResumeQuery("");
    setResumeLoading(true);
    setSelectedPreset(preset);
    setApplyOpen(true);
    setSelectedResumeId(defaultResume?.id ?? "");
  }

  function toggleComparison(preset: ResumeFontPreset) {
    setCompareIds((current) => {
      if (current.includes(preset.id)) {
        return current.filter((id) => id !== preset.id);
      }
      return current.length < 4 ? [...current, preset.id] : current;
    });
  }

  const comparedPresets = compareIds
    .map((id) => listResumeFontPresets().find((preset) => preset.id === id))
    .filter((preset): preset is ResumeFontPreset => Boolean(preset));
  const activeAssetKeys = [
    ...new Set(
      listResumeFontPresets()
        .filter(
          (preset) =>
            activePreviewIds.has(preset.id) ||
            compareIds.includes(preset.id) ||
            detailPreset?.id === preset.id,
        )
        .map((preset) => preset.assetKey),
    ),
  ];

  return (
    <>
      {activeAssetKeys.map((assetKey) => (
        <ResumeFontAssets
          assetKey={assetKey}
          key={assetKey}
          onStatusChange={(key, status) => {
            setAssetStatuses((current) => {
              if (current.get(key) === status) return current;
              const next = new Map(current);
              next.set(key, status);
              return next;
            });
          }}
        />
      ))}
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
              <span className={styles.fieldLabel}>
                {t("fontMarket.search")}
              </span>
              <Input
                allowClear
                aria-label={t("fontMarket.search")}
                className={styles.search}
                onChange={(event) => {
                  setQuery(event.target.value);
                  syncMarketUrl(event.target.value, filters);
                }}
                placeholder={t("fontMarket.searchPlaceholder")}
                prefix={<SearchIcon size={16} />}
                type="search"
                value={query}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t("fontMarket.previewText")}
              </span>
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
            <FontMarketFilters
              filters={filters}
              onChange={(nextFilters) => {
                setFilters(nextFilters);
                syncMarketUrl(query, nextFilters);
              }}
              onClear={() => {
                setQuery("");
                setFilters(defaultMarketQuery);
                syncMarketUrl("", defaultMarketQuery);
              }}
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
              filteredPresets.map((preset) => {
                const assetStatus =
                  assetStatuses.get(preset.assetKey) ?? "idle";
                const previewReady =
                  readyPreviewTextById.get(preset.id) === deferredPreviewText;

                return (
                  <article
                    className={styles.card}
                    data-testid="font-market-card"
                    key={preset.id}
                  >
                    <header className={styles.cardHeader}>
                      <div className={styles.fontIdentity}>
                        <h2 className={styles.fontName}>{preset.name}</h2>
                        <span className={styles.fontDescription}>
                          {t(preset.descriptionKey)}
                        </span>
                      </div>
                      <div className={styles.cardHeaderActions}>
                        {preset.recommended ? (
                          <Tag
                            className={styles.recommendationTag}
                            color="processing"
                          >
                            {t("fontMarket.recommended")}
                          </Tag>
                        ) : null}
                        <Button
                          aria-label={
                            preferences.some(
                              (preference) =>
                                preference.fontPresetId === preset.id &&
                                preference.favorite,
                            )
                              ? t("fontMarket.unfavorite", {
                                  font: preset.name,
                                })
                              : t("fontMarket.favorite", { font: preset.name })
                          }
                          className={styles.favoriteButton}
                          onClick={() => void toggleFavorite(preset)}
                          type="text"
                        >
                          <FavoriteIcon
                            filled={preferences.some(
                              (preference) =>
                                preference.fontPresetId === preset.id &&
                                preference.favorite,
                            )}
                          />
                        </Button>
                      </div>
                    </header>

                    <div className={styles.previewSlot}>
                      <div
                        className={styles.preview}
                        data-font-load-family={preset.fontLoadFamily}
                        data-font-preview-id={preset.id}
                        data-font-ready={previewReady}
                        data-testid={`font-preview-${preset.id}`}
                        style={
                          activePreviewIds.has(preset.id)
                            ? { fontFamily: preset.resolvedFontFamily }
                            : undefined
                        }
                      >
                        {deferredPreviewText}
                      </div>
                      {!previewReady ? (
                        <div
                          aria-live="polite"
                          className={styles.previewLoading}
                          data-testid={`font-preview-loading-${preset.id}`}
                          role="status"
                        >
                          {assetStatus === "error" ? (
                            <>
                              <span>{t("fontMarket.previewFailed")}</span>
                              <Button
                                onClick={() => {
                                  void loadResumeFontAssets(
                                    preset.assetKey,
                                    true,
                                  ).catch(() => undefined);
                                }}
                                size="small"
                                type="link"
                              >
                                {t("fontMarket.previewRetry")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Spin size="small" />
                              <span>{t("fontMarket.previewLoading")}</span>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <footer className={styles.cardFooter}>
                      <div className={styles.metadata}>
                        {preset.scripts.map((script) => (
                          <Tag key={script}>
                            {t(`fontMarket.script.${script}`)}
                          </Tag>
                        ))}
                        {usesFallbackForText(preset, deferredPreviewText) ? (
                          <Tag color="warning">
                            {t("fontMarket.fallbackWarning")}
                          </Tag>
                        ) : null}
                      </div>
                      <div className={styles.actions}>
                        <div>
                          <Button
                            onClick={() => {
                              setDetailPreset(preset);
                              setDetailOpen(true);
                            }}
                            type="text"
                          >
                            {t("fontMarket.details")}
                          </Button>
                          <Button
                            aria-pressed={compareIds.includes(preset.id)}
                            disabled={
                              compareIds.length >= 4 &&
                              !compareIds.includes(preset.id)
                            }
                            onClick={() => toggleComparison(preset)}
                            type="text"
                          >
                            {compareIds.includes(preset.id)
                              ? t("fontMarket.compareRemove")
                              : t("fontMarket.compareAdd")}
                          </Button>
                        </div>
                        <Button
                          onClick={() => openApplyDialog(preset)}
                          type="primary"
                        >
                          {t("fontMarket.apply")}
                        </Button>
                      </div>
                    </footer>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <FontDialogFrame
        onClose={() => setApplyOpen(false)}
        open={applyOpen && Boolean(selectedPreset)}
        title={
          selectedPreset
            ? t("fontMarket.applyTitle", { font: selectedPreset.name })
            : ""
        }
        width="520px"
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
              <input
                name="fontPresetId"
                type="hidden"
                value={selectedPreset.id}
              />
              <input
                name="version"
                type="hidden"
                value={
                  resumePage.items.find(
                    (resume) => resume.id === selectedResumeId,
                  )?.version ??
                  (defaultResume?.id === selectedResumeId
                    ? defaultResume.version
                    : "")
                }
              />
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
                <span className={styles.fieldLabel}>
                  {t("fontMarket.targetResume")}
                </span>
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
                <Button htmlType="button" onClick={() => setApplyOpen(false)}>
                  {t("common.dismiss")}
                </Button>
                <Button
                  disabled={!selectedResumeId}
                  htmlType="submit"
                  type="primary"
                >
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
      </FontDialogFrame>

      <FontDetailDialog
        onApply={(preset) => {
          setDetailOpen(false);
          openApplyDialog(preset);
        }}
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
        preset={detailPreset}
        previewText={deferredPreviewText}
      />
      <FontCompareTray
        onClear={() => setCompareIds([])}
        onCompare={() => setCompareOpen(true)}
        presets={comparedPresets}
      />
      <FontCompareDialog
        onClose={() => setCompareOpen(false)}
        onRemove={(id) =>
          setCompareIds((current) => current.filter((item) => item !== id))
        }
        open={compareOpen}
        presets={comparedPresets}
        previewText={deferredPreviewText}
      />
    </>
  );
}
