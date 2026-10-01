"use client";

import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Spin,
} from "antd";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import {
  PUBLIC_RESUME_APPEARANCE_DEFAULTS,
  serializePublicResumeAppearance,
  type PublicResumeAppearance,
} from "@/domain/resume/public-appearance";
import { useI18n } from "@/i18n/I18nProvider";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import { fetchResumeEntriesPage } from "@/lib/resume/client";
import type { PageResult } from "@/lib/shared/pagination";

import { usePublicResumeUrlBuilderStyles } from "./PublicResumeUrlBuilder.style";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 250;
const COLOR_PATTERN = /^[0-9a-f]{6}$/i;
const subscribeToOrigin = () => () => {};

const enumOptions = {
  theme: ["auto", "light", "dark"],
  surface: ["soft", "plain"],
  header: ["full", "title", "none"],
  labels: ["show", "hide"],
  frame: ["shadow", "border", "none"],
  align: ["center", "left"],
} as const;

export function buildPublicResumeUrl(
  origin: string,
  slug: string,
  appearance: PublicResumeAppearance,
) {
  if (!origin || !slug) return "";
  const url = new URL(`/resume/${encodeURIComponent(slug)}`, origin);
  url.search = serializePublicResumeAppearance(appearance).toString();
  return url.href;
}

export function PublicResumeUrlBuilder({
  viewerMode,
}: {
  viewerMode: "product" | "signed-out" | "super-admin";
}) {
  const { styles } = usePublicResumeUrlBuilderStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    () => window.location.origin,
    () => "",
  );
  const [status, setStatus] = useState<
    "loading" | "ready" | "signed-out" | "error"
  >("loading");
  const [result, setResult] = useState<PageResult<ResumeCatalogEntry>>({
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedResume, setSelectedResume] =
    useState<ResumeCatalogEntry>();
  const [appearance, setAppearance] = useState<PublicResumeAppearance>(
    PUBLIC_RESUME_APPEARANCE_DEFAULTS,
  );
  const [backgroundInput, setBackgroundInput] = useState("");
  const [accentInput, setAccentInput] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestKey = `${page}\u0000${query}\u0000${reloadRevision}`;
  const [settledRequestKey, setSettledRequestKey] = useState("");
  const isFetching = status === "loading" || settledRequestKey !== requestKey;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextQuery = searchInput.trim();
      setPage(1);
      setQuery(nextQuery);
    }, SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (viewerMode !== "product") return;

    let active = true;

    void fetchResumeEntriesPage({
      page,
      pageSize: PAGE_SIZE,
      publication: "published",
      query,
    })
      .then((nextResult) => {
        if (!active) return;
        setResult((current) => {
          if (nextResult.page === 1) return nextResult;

          const items = new Map(
            current.items.map((item) => [item.id, item] as const),
          );
          for (const item of nextResult.items) items.set(item.id, item);

          return { ...nextResult, items: [...items.values()] };
        });
        setStatus("ready");
        setSelectedResume((current) =>
          current ?? nextResult.items.find((item) => item.slug),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.message === "unauthorized") {
          setStatus("signed-out");
          return;
        }

        setStatus((current) => (current === "loading" ? "error" : current));
        toast.error({
          content: t("docs.builder.loadFailed"),
          key: "public-resume-builder-load",
        });
      })
      .finally(() => {
        if (active) setSettledRequestKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [page, query, reloadRevision, requestKey, t, toast, viewerMode]);

  const generatedUrl = useMemo(
    () =>
      buildPublicResumeUrl(origin, selectedResume?.slug ?? "", appearance),
    [appearance, origin, selectedResume?.slug],
  );

  function updateAppearance<TKey extends keyof PublicResumeAppearance>(
    key: TKey,
    value: PublicResumeAppearance[TKey],
  ) {
    setAppearance((current) => Object.freeze({ ...current, [key]: value }));
  }

  function updateColor(
    property: "background" | "accent",
    value: string,
  ) {
    const normalized = value.replace(/^#/, "").toLowerCase().slice(0, 6);
    if (property === "background") setBackgroundInput(normalized);
    else setAccentInput(normalized);

    updateAppearance(
      property,
      COLOR_PATTERN.test(normalized) ? normalized : undefined,
    );
  }

  function resetAppearance() {
    setAppearance(PUBLIC_RESUME_APPEARANCE_DEFAULTS);
    setBackgroundInput("");
    setAccentInput("");
  }

  async function copyGeneratedUrl() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success(t("docs.builder.copied"));
    } catch {
      toast.error({
        content: t("docs.builder.copyFailed"),
        key: "public-resume-builder-copy",
      });
    }
  }

  if (viewerMode === "signed-out" || status === "signed-out") {
    return (
      <section className={styles.root}>
        <h2>{t("docs.builder.title")}</h2>
        <p>{t("docs.builder.signedOut")}</p>
        <Button href="/sign-in" type="primary">
          {t("docs.builder.signIn")}
        </Button>
      </section>
    );
  }

  if (viewerMode === "super-admin") {
    return (
      <section className={styles.root}>
        <h2>{t("docs.builder.title")}</h2>
        <p>{t("docs.builder.superAdmin")}</p>
        <Button href="/app/manage" type="primary">
          {t("docs.builder.openManagement")}
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="url-builder-title">
      <h2 id="url-builder-title">{t("docs.builder.title")}</h2>

      {status === "loading" ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
      {status === "error" ? (
        <div className={styles.state}>
          <Empty description={t("docs.builder.loadFailed")}>
            <Button
              onClick={() => {
                setStatus("loading");
                setReloadRevision((value) => value + 1);
              }}
            >
              {t("docs.builder.retry")}
            </Button>
          </Empty>
        </div>
      ) : null}
      {status === "ready" ? (
        <>
          <Form layout="vertical">
            <Form.Item label={t("docs.builder.selectResume")}>
              <Select
                aria-label={t("docs.builder.resume")}
                className={styles.resumeSelect}
                filterOption={false}
                labelRender={({ value, label }) =>
                  value === selectedResume?.id ? selectedResume.title : label
                }
                loading={isFetching}
                notFoundContent={
                  isFetching ? <Spin size="small" /> : t("docs.builder.empty")
                }
                options={result.items.map((resume) => ({
                  label: (
                    <span className={styles.resumeOption}>
                      <strong title={resume.title}>{resume.title}</strong>
                      <span title={resume.summary}>{resume.summary}</span>
                    </span>
                  ),
                  value: resume.id,
                }))}
                placeholder={t("docs.builder.searchPlaceholder")}
                showSearch
                value={selectedResume?.id}
                onChange={(resumeId) => {
                  const resume = result.items.find(
                    (item) => item.id === resumeId,
                  );
                  if (resume) setSelectedResume(resume);
                  setSearchInput("");
                  setPage(1);
                  setQuery("");
                }}
                onOpenChange={(open) => {
                  if (open || !searchInput) return;
                  setSearchInput("");
                  setPage(1);
                  setQuery("");
                }}
                onSearch={setSearchInput}
                onPopupScroll={(event) => {
                  const target = event.currentTarget;
                  const reachedEnd =
                    target.scrollTop + target.clientHeight >=
                    target.scrollHeight - 24;
                  if (
                    reachedEnd &&
                    !isFetching &&
                    result.page < result.totalPages
                  ) {
                    const nextPage = result.page + 1;
                    if (page === nextPage) {
                      setReloadRevision((current) => current + 1);
                    } else {
                      setPage(nextPage);
                    }
                  }
                }}
              />
            </Form.Item>
            <div className={styles.controls}>
              {(Object.keys(enumOptions) as Array<keyof typeof enumOptions>).map(
                (property) => (
                  <Form.Item
                    key={property}
                    label={t(`docs.builder.field.${property}`)}
                  >
                    <Select
                      aria-label={t(`docs.builder.field.${property}`)}
                      value={appearance[property]}
                      options={enumOptions[property].map((value) => ({
                        label: t(`docs.builder.value.${value}`),
                        value,
                      }))}
                      onChange={(value) => updateAppearance(property, value)}
                    />
                  </Form.Item>
                ),
              )}
              <Form.Item
                help={
                  backgroundInput && !COLOR_PATTERN.test(backgroundInput)
                    ? t("docs.builder.colorHelp")
                    : undefined
                }
                label={t("docs.builder.field.background")}
                validateStatus={
                  backgroundInput && !COLOR_PATTERN.test(backgroundInput)
                    ? "error"
                    : undefined
                }
              >
                <Space.Compact block>
                  <span aria-hidden="true" className={styles.colorPrefix}>#</span>
                  <Input
                    aria-label={t("docs.builder.field.background")}
                    className={styles.colorInput}
                    maxLength={6}
                    value={backgroundInput}
                    onChange={(event) =>
                      updateColor("background", event.target.value)
                    }
                  />
                </Space.Compact>
              </Form.Item>
              <Form.Item
                help={
                  accentInput && !COLOR_PATTERN.test(accentInput)
                    ? t("docs.builder.colorHelp")
                    : undefined
                }
                label={t("docs.builder.field.accent")}
                validateStatus={
                  accentInput && !COLOR_PATTERN.test(accentInput)
                    ? "error"
                    : undefined
                }
              >
                <Space.Compact block>
                  <span aria-hidden="true" className={styles.colorPrefix}>#</span>
                  <Input
                    aria-label={t("docs.builder.field.accent")}
                    className={styles.colorInput}
                    maxLength={6}
                    value={accentInput}
                    onChange={(event) =>
                      updateColor("accent", event.target.value)
                    }
                  />
                </Space.Compact>
              </Form.Item>
              {(["padding", "width", "gap"] as const).map((property) => {
                const limits = {
                  padding: [0, 96],
                  width: [640, 1440],
                  gap: [0, 64],
                }[property];

                return (
                  <Form.Item
                    key={property}
                    label={t(`docs.builder.field.${property}`)}
                  >
                    <InputNumber
                      aria-label={t(`docs.builder.field.${property}`)}
                      className={styles.numberInput}
                      max={limits[1]}
                      min={limits[0]}
                      precision={0}
                      value={appearance[property]}
                      onChange={(value) => {
                        if (typeof value === "number") {
                          updateAppearance(property, value);
                        }
                      }}
                    />
                  </Form.Item>
                );
              })}
            </div>
          </Form>

          <div className={styles.output}>
            <Input
              aria-label={t("docs.builder.output")}
              readOnly
              value={generatedUrl}
            />
            <div className={styles.actions}>
              <Button disabled={!generatedUrl} onClick={() => void copyGeneratedUrl()}>
                {t("docs.builder.copy")}
              </Button>
              <Button onClick={resetAppearance}>{t("docs.builder.reset")}</Button>
              <Button
                disabled={!generatedUrl}
                href={generatedUrl || undefined}
                rel="noopener noreferrer"
                target="_blank"
                type="primary"
              >
                {t("docs.builder.open")}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
