"use client";

import {
  ArrowRightOutlined,
  EditOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  RightOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import type {
  ResumeDiffPresentation,
  ResumeRendererDiffPresentation,
} from "@/components/resume/resume-diff-presentation";
import type {
  ResumeDocumentDiffKind,
  ResumeDocumentDiffResult,
} from "@/domain/resume/document-diff";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

import { useResumeDiffCanvasStyles } from "./ResumeDiffCanvas.style";
import { formatResumeDiffSettingValue } from "./resume-diff-setting-display";

const RENDERER_SCALE = 0.68;
const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;

function getKindIcon(kind: ResumeDocumentDiffKind) {
  switch (kind) {
    case "added":
      return <PlusOutlined />;
    case "removed":
      return <MinusOutlined />;
    case "changed":
      return <EditOutlined />;
    case "moved":
      return <SwapOutlined />;
  }
}

function DiffSummaryKind({
  count,
  kind,
}: {
  count: number;
  kind: ResumeDocumentDiffKind;
}) {
  const { styles } = useResumeDiffCanvasStyles();
  const { t } = useI18n();

  return (
    <span
      className={styles.summaryKind}
      data-diff-kind={kind}
      data-testid={`diff-summary-${kind}`}
    >
      {getKindIcon(kind)}
      <span>
        {t(`editor.diff.kind.${kind}`)} {count}
      </span>
    </span>
  );
}

function ScaledResumeRenderer({
  document,
  presentation,
}: {
  document: ResumeDocument;
  presentation: ResumeRendererDiffPresentation;
}) {
  const { styles } = useResumeDiffCanvasStyles();
  const contentRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(A4_HEIGHT_PX);

  useLayoutEffect(() => {
    const content = contentRef.current;

    if (!content) return;

    const measure = () => {
      setNaturalHeight(Math.max(A4_HEIGHT_PX, content.scrollHeight));
    };
    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(content);

    return () => observer.disconnect();
  }, [document]);

  return (
    <div
      className={styles.scaleShell}
      style={{
        width: A4_WIDTH_PX * RENDERER_SCALE,
        height: naturalHeight * RENDERER_SCALE,
      }}
    >
      <div
        ref={contentRef}
        className={styles.scaleContent}
        style={{
          width: A4_WIDTH_PX,
          transform: `scale(${RENDERER_SCALE})`,
        }}
      >
        <ResumeRenderer
          document={document}
          diffPresentation={presentation}
          mode="view"
          zoom={RENDERER_SCALE}
        />
      </div>
    </div>
  );
}

function findDiffTarget(root: HTMLElement, changeId: string) {
  return Array.from(
    root.querySelectorAll<HTMLElement>("[data-resume-diff-change-id]"),
  ).find((element) =>
    element.dataset.resumeDiffChangeId?.split(" ").includes(changeId),
  );
}

function isHexColor(value: string | undefined) {
  return Boolean(value && /^#[\da-f]{6}$/i.test(value));
}

function getFieldLabel(field: string, t: ReturnType<typeof useI18n>["t"]) {
  const labels: Record<string, Parameters<typeof t>[0]> = {
    title: "editor.diff.field.title",
    locale: "editor.diff.field.locale",
    "page.margin": "editor.diff.field.pageMargin",
    "typography.fontFamily": "common.fontFamily",
    "typography.baseFontSize": "common.baseFontSize",
    "typography.lineHeight": "common.baseLineHeight",
    "theme.accent": "common.accentColor",
    "theme.textColor": "common.textThemeColor",
    "theme.mutedColor": "common.mutedThemeColor",
    "titleStyle.color": "editor.diff.field.sectionTitleColor",
  };
  const key = labels[field];

  return key ? t(key) : field;
}

function SettingValue({ value }: { value?: string }) {
  const style = isHexColor(value)
    ? {
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 3,
        background: value,
        boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.18)",
      }
    : undefined;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {style ? <i aria-hidden="true" style={style} /> : null}
      {value || "-"}
    </span>
  );
}

export function ResumeDiffCanvas({
  sourceDocument,
  sourceLabel,
  targetDocument,
  targetLabel,
  result,
  presentation,
}: {
  sourceDocument: ResumeDocument;
  sourceLabel: string;
  targetDocument: ResumeDocument;
  targetLabel: string;
  result: ResumeDocumentDiffResult;
  presentation: ResumeDiffPresentation;
}) {
  const { styles } = useResumeDiffCanvasStyles();
  const { t } = useI18n();
  const sourceViewportRef = useRef<HTMLDivElement>(null);
  const targetViewportRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"source" | "target" | null>(null);
  const [activeChangeIndex, setActiveChangeIndex] = useState(0);
  const changeCount = presentation.orderedChangeIds.length;

  useEffect(() => {
    if (changeCount === 0) return;

    const changeId = presentation.orderedChangeIds[activeChangeIndex];

    if (!changeId) return;

    const sourceTarget = sourceViewportRef.current
      ? findDiffTarget(sourceViewportRef.current, changeId)
      : undefined;
    const targetTarget = targetViewportRef.current
      ? findDiffTarget(targetViewportRef.current, changeId)
      : undefined;

    sourceTarget?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    targetTarget?.scrollIntoView?.({ behavior: "smooth", block: "center" });

    if (!sourceTarget && !targetTarget) {
      if (sourceViewportRef.current) sourceViewportRef.current.scrollTop = 0;
      if (targetViewportRef.current) targetViewportRef.current.scrollTop = 0;
    }
  }, [activeChangeIndex, changeCount, presentation.orderedChangeIds]);

  function synchronizeScroll(
    side: "source" | "target",
    event: UIEvent<HTMLDivElement>,
  ) {
    if (syncingRef.current && syncingRef.current !== side) {
      syncingRef.current = null;
      return;
    }

    const source = event.currentTarget;
    const target =
      side === "source" ? targetViewportRef.current : sourceViewportRef.current;

    if (!target) return;

    const sourceRange = Math.max(1, source.scrollHeight - source.clientHeight);
    const targetRange = Math.max(0, target.scrollHeight - target.clientHeight);
    syncingRef.current = side;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    window.requestAnimationFrame(() => {
      if (syncingRef.current === side) syncingRef.current = null;
    });
  }

  const sourcePresentation: ResumeRendererDiffPresentation = {
    side: "source",
    annotations: presentation.sourceAnnotations,
    pageSettings: presentation.pageSettings,
  };
  const targetPresentation: ResumeRendererDiffPresentation = {
    side: "target",
    annotations: presentation.targetAnnotations,
    pageSettings: presentation.pageSettings,
  };

  function renderPane(
    side: "source" | "target",
    label: string,
    document: ResumeDocument,
    diffPresentation: ResumeRendererDiffPresentation,
    viewportRef: typeof sourceViewportRef,
  ): ReactNode {
    return (
      <section
        aria-label={t("editor.diff.rendererRegion", { label })}
        className={styles.pane}
      >
        <header className={styles.paneHeader}>
          <strong>{label}</strong>
          <span>{t(`editor.diff.${side}Hint`)}</span>
        </header>
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-testid={`diff-${side}-viewport`}
          onScroll={(event) => synchronizeScroll(side, event)}
        >
          <ScaledResumeRenderer
            document={document}
            presentation={diffPresentation}
          />
        </div>
      </section>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.summary}>
          <span className={styles.summaryLead}>
            {t("editor.diff.changeCount", { count: result.summary.total })}
          </span>
          <DiffSummaryKind count={result.summary.added} kind="added" />
          <DiffSummaryKind count={result.summary.removed} kind="removed" />
          <DiffSummaryKind count={result.summary.changed} kind="changed" />
          <DiffSummaryKind count={result.summary.moved} kind="moved" />
        </div>
        {changeCount > 0 ? (
          <div className={styles.navigation}>
            <Button
              aria-label={t("editor.diff.previousChange")}
              disabled={activeChangeIndex === 0}
              icon={<LeftOutlined />}
              shape="circle"
              size="small"
              onClick={() => setActiveChangeIndex((index) => index - 1)}
            />
            <span className={styles.navigationStatus}>
              {t("editor.diff.changePosition", {
                current: activeChangeIndex + 1,
                total: changeCount,
              })}
            </span>
            <Button
              aria-label={t("editor.diff.nextChange")}
              disabled={activeChangeIndex === changeCount - 1}
              icon={<RightOutlined />}
              shape="circle"
              size="small"
              onClick={() => setActiveChangeIndex((index) => index + 1)}
            />
          </div>
        ) : null}
      </div>

      {presentation.pageSettings.length > 0 ? (
        <div className={styles.settingStrip}>
          <span className={styles.settingLabel}>
            {t("editor.diff.pageSettings")}
          </span>
          {presentation.pageSettings.map((setting) => (
            <span
              key={setting.changeId}
              className={styles.settingChip}
              data-testid={`diff-page-setting-${setting.field}`}
            >
              <strong>{getFieldLabel(setting.field, t)}</strong>
              <SettingValue
                value={formatResumeDiffSettingValue(
                  setting.field,
                  setting.sourceValue,
                  t,
                )}
              />
              <ArrowRightOutlined className={styles.settingArrow} />
              <SettingValue
                value={formatResumeDiffSettingValue(
                  setting.field,
                  setting.targetValue,
                  t,
                )}
              />
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.panes}>
        {renderPane(
          "source",
          sourceLabel,
          sourceDocument,
          sourcePresentation,
          sourceViewportRef,
        )}
        {renderPane(
          "target",
          targetLabel,
          targetDocument,
          targetPresentation,
          targetViewportRef,
        )}
      </div>
    </div>
  );
}
