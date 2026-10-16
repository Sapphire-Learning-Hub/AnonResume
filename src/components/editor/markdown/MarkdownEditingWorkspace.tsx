"use client";

import { WarningOutlined } from "@ant-design/icons";
import { useState, type RefObject, type UIEventHandler } from "react";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import type {
  ResumeMarkdownDiagnostic,
} from "@/domain/resume/markdown";
import type { ResumeDocument } from "@/domain/resume/schema";

import { MarkdownDiagnostics, type MarkdownWorkspaceLabels } from "./MarkdownDiagnostics";
import { useMarkdownEditingWorkspaceStyles } from "./MarkdownEditingWorkspace.style";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";

export function MarkdownEditingWorkspace({
  source,
  diagnostics,
  document,
  isPreviewStale = false,
  labels,
  zoom,
  paginationRevision,
  showPrintSafeArea,
  previewViewportRef,
  getDiagnosticMessage,
  onSourceChange,
  onPageCountChange,
  onPaginationReadyChange,
  onPreviewScroll,
}: {
  source: string;
  diagnostics: ResumeMarkdownDiagnostic[];
  document: ResumeDocument;
  isPreviewStale?: boolean;
  labels: MarkdownWorkspaceLabels;
  zoom: number;
  paginationRevision?: number;
  showPrintSafeArea?: boolean;
  previewViewportRef?: RefObject<HTMLDivElement | null>;
  getDiagnosticMessage: (diagnostic: ResumeMarkdownDiagnostic) => string;
  onSourceChange: (source: string) => void;
  onPageCountChange: (pageCount: number) => void;
  onPaginationReadyChange: (ready: boolean) => void;
  onPreviewScroll?: UIEventHandler<HTMLDivElement>;
}) {
  const { styles } = useMarkdownEditingWorkspaceStyles();
  const [focusRequest, setFocusRequest] = useState<{
    diagnostic: ResumeMarkdownDiagnostic;
    requestId: number;
  }>();

  const focusDiagnostic = (diagnostic: ResumeMarkdownDiagnostic) => {
    setFocusRequest((current) => ({
      diagnostic,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  return (
    <section className={styles.workspace} data-testid="markdown-editing-workspace">
      <section aria-label={labels.source} className={styles.sourcePane}>
        <h2 className={styles.paneHeading}>{labels.source}</h2>
        <MarkdownSourceEditor
          ariaLabel={labels.source}
          diagnostics={diagnostics}
          focusRequest={focusRequest}
          getDiagnosticMessage={getDiagnosticMessage}
          value={source}
          onChange={onSourceChange}
          onFocusDiagnostic={() => undefined}
        />
        <MarkdownDiagnostics
          diagnostics={diagnostics}
          getMessage={getDiagnosticMessage}
          labels={labels}
          onSelect={focusDiagnostic}
        />
      </section>

      <section className={styles.previewPane}>
        <header className={styles.previewHeader}>
          <h2 className={styles.paneHeading}>{labels.preview}</h2>
          {isPreviewStale ? (
            <p className={styles.stalePreview} role="status">
              <WarningOutlined aria-hidden="true" />
              {labels.stalePreview}
            </p>
          ) : null}
        </header>
        <div
          ref={previewViewportRef}
          className={styles.previewViewport}
          onScroll={onPreviewScroll}
        >
          <div
            aria-label={labels.preview}
            className={styles.previewContent}
            inert
            role="region"
            style={{ transform: `scale(${zoom})` }}
          >
            <ResumeRenderer
              document={document}
              mode="view"
              paginationRevision={paginationRevision}
              showPrintSafeArea={showPrintSafeArea}
              zoom={zoom}
              onPageCountChange={onPageCountChange}
              onPaginationReadyChange={onPaginationReadyChange}
            />
          </div>
        </div>
      </section>
    </section>
  );
}
