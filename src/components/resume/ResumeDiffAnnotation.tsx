"use client";

import {
  cloneElement,
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import { createStyles } from "antd-style";

import type { ResumeDocumentDiffChange } from "@/domain/resume/document-diff";
import { useI18n } from "@/i18n/I18nProvider";

import type {
  ResumeDiffNodeAnnotation,
  ResumeRendererDiffPresentation,
} from "./resume-diff-presentation";

const ResumeDiffContext = createContext<
  ResumeRendererDiffPresentation | undefined
>(undefined);

const useResumeDiffAnnotationStyles = createStyles(({ css }) => ({
  target: css`
    position: relative;
    border-radius: 6px;
    outline: 2px solid var(--resume-diff-color);
    outline-offset: 3px;
    box-shadow: inset 0 0 0 999px var(--resume-diff-wash);

    &[data-resume-diff-kind="added"] {
      --resume-diff-color: #16a34a;
      --resume-diff-wash: rgba(34, 197, 94, 0.08);
    }

    &[data-resume-diff-kind="removed"] {
      --resume-diff-color: #dc2626;
      --resume-diff-wash: rgba(239, 68, 68, 0.08);
    }

    &[data-resume-diff-kind="changed"] {
      --resume-diff-color: #d97706;
      --resume-diff-wash: rgba(245, 158, 11, 0.09);
    }

    &[data-resume-diff-kind="moved"] {
      --resume-diff-color: #2563eb;
      --resume-diff-wash: rgba(59, 130, 246, 0.08);
    }

    @media print {
      outline: 0;
      box-shadow: none;
    }
  `,
  marker: css`
    position: absolute;
    z-index: 8;
    top: -14px;
    right: -5px;
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--resume-diff-color);
    color: #fff;
    font-family: sans-serif;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 3px 8px rgba(15, 23, 42, 0.18);

    @media print {
      display: none;
    }
  `,
  addedText: css`
    padding: 0 0.08em;
    border-radius: 0.18em;
    background: rgba(34, 197, 94, 0.2);
    color: inherit;
    text-decoration: none;
  `,
  removedText: css`
    padding: 0 0.08em;
    border-radius: 0.18em;
    background: rgba(239, 68, 68, 0.18);
    color: inherit;
    text-decoration-color: #dc2626;
    text-decoration-thickness: 1.5px;
  `,
}));

export function ResumeDiffProvider({
  presentation,
  children,
}: {
  presentation?: ResumeRendererDiffPresentation;
  children: ReactNode;
}) {
  return (
    <ResumeDiffContext.Provider value={presentation}>
      {children}
    </ResumeDiffContext.Provider>
  );
}

export function useResumeDiffAnnotations(
  nodeType: ResumeDocumentDiffChange["nodeType"],
  nodeId: string,
  fields: readonly string[],
) {
  const presentation = useContext(ResumeDiffContext);

  if (!presentation) return [];

  return fields.flatMap(
    (field) => presentation.annotations.get(`${nodeType}:${nodeId}:${field}`) ?? [],
  );
}

function getPrimaryAnnotation(annotations: ResumeDiffNodeAnnotation[]) {
  const priorities = { changed: 4, added: 3, removed: 3, moved: 2 } as const;

  return annotations.reduce((primary, annotation) =>
    priorities[annotation.kind] > priorities[primary.kind] ? annotation : primary,
  );
}

export function ResumeDiffTarget({
  nodeType,
  nodeId,
  fields,
  children,
}: {
  nodeType: ResumeDocumentDiffChange["nodeType"];
  nodeId: string;
  fields: readonly string[];
  children: ReactElement<Record<string, unknown>>;
}) {
  const annotations = useResumeDiffAnnotations(nodeType, nodeId, fields);
  const { styles } = useResumeDiffAnnotationStyles();
  const { t } = useI18n();

  if (annotations.length === 0) return children;

  const primary = getPrimaryAnnotation(annotations);
  const existingClassName =
    typeof children.props.className === "string" ? children.props.className : "";
  const changeIds = Array.from(
    new Set(annotations.map((annotation) => annotation.changeId)),
  ).join(" ");
  const markerText = t(`editor.diff.kind.${primary.kind}`);

  return cloneElement(
    children,
    {
      className: [existingClassName, styles.target].filter(Boolean).join(" "),
      "data-resume-diff-kind": primary.kind,
      "data-resume-diff-side": primary.side,
      "data-resume-diff-change-id": changeIds,
    },
    children.props.children as ReactNode,
    <span
      key="resume-diff-marker"
      aria-hidden="true"
      className={styles.marker}
      data-resume-diff-marker="true"
    >
      {markerText}
      {primary.kind === "moved" && primary.valueLabel
        ? ` · ${primary.valueLabel}`
        : null}
    </span>,
  );
}

export function ResumeDiffChangedText({
  side,
  children,
}: {
  side: ResumeRendererDiffPresentation["side"];
  children: ReactNode;
}) {
  const { styles } = useResumeDiffAnnotationStyles();

  return side === "source" ? (
    <del className={styles.removedText}>{children}</del>
  ) : (
    <ins className={styles.addedText}>{children}</ins>
  );
}
