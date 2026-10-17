"use client";

import { WarningOutlined } from "@ant-design/icons";
import { useState, type ReactNode } from "react";

import type {
  ResumeMarkdownDiagnostic,
} from "@/domain/resume/markdown";

import { MarkdownDiagnostics, type MarkdownWorkspaceLabels } from "./MarkdownDiagnostics";
import { useMarkdownEditingWorkspaceStyles } from "./MarkdownEditingWorkspace.style";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";

export function MarkdownEditingWorkspace({
  source,
  diagnostics,
  isPreviewStale = false,
  labels,
  getDiagnosticMessage,
  resizeHandle,
  onSourceChange,
}: {
  source: string;
  diagnostics: ResumeMarkdownDiagnostic[];
  isPreviewStale?: boolean;
  labels: MarkdownWorkspaceLabels;
  getDiagnosticMessage: (diagnostic: ResumeMarkdownDiagnostic) => string;
  resizeHandle?: ReactNode;
  onSourceChange: (source: string) => void;
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
    <section
      aria-label={labels.source}
      className={styles.sourcePane}
      data-testid="markdown-editing-workspace"
    >
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
      {isPreviewStale ? (
        <p className={styles.stalePreview} role="status">
          <WarningOutlined aria-hidden="true" />
          {labels.stalePreview}
        </p>
      ) : null}
      <MarkdownDiagnostics
        diagnostics={diagnostics}
        getMessage={getDiagnosticMessage}
        labels={labels}
        onSelect={focusDiagnostic}
      />
      {resizeHandle}
    </section>
  );
}
