"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  lintGutter,
  lintKeymap,
  setDiagnostics,
  type Diagnostic,
} from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

import { createMarkdownSearchHandle, markdownSearchExtension } from "@/components/editor/search/codemirror-search";
import type { MarkdownSearchHandle } from "@/components/editor/search/markdown-search";

import type { ResumeMarkdownDiagnostic } from "@/domain/resume/markdown";

import { useMarkdownSourceEditorStyles } from "./MarkdownSourceEditor.style";

export interface MarkdownSourceEditorProps {
  value: string;
  searchRef?: Ref<MarkdownSearchHandle>;
  diagnostics: ResumeMarkdownDiagnostic[];
  focusRequest?: {
    diagnostic: ResumeMarkdownDiagnostic;
    requestId: number;
  };
  ariaLabel: string;
  onChange: (value: string) => void;
  onFocusDiagnostic: (diagnostic: ResumeMarkdownDiagnostic) => void;
  getDiagnosticMessage?: (diagnostic: ResumeMarkdownDiagnostic) => string;
}

function toCodeMirrorDiagnostics(
  view: EditorView,
  diagnostics: ResumeMarkdownDiagnostic[],
  getMessage: (diagnostic: ResumeMarkdownDiagnostic) => string,
  onFocus: (diagnostic: ResumeMarkdownDiagnostic) => void,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const lineNumber = Math.min(
      Math.max(1, diagnostic.line),
      view.state.doc.lines,
    );
    const line = view.state.doc.line(lineNumber);
    const from = Math.min(
      line.to,
      line.from + Math.max(0, diagnostic.column - 1),
    );
    return {
      from,
      to: Math.min(line.to, from + 1),
      severity: diagnostic.severity,
      message: getMessage(diagnostic),
      actions: [
        {
          name: getMessage(diagnostic),
          apply(editor) {
            editor.dispatch({ selection: { anchor: from }, scrollIntoView: true });
            editor.focus();
            onFocus(diagnostic);
          },
        },
      ],
    };
  });
}

export function MarkdownSourceEditor({
  value,
  searchRef,
  diagnostics,
  focusRequest,
  ariaLabel,
  onChange,
  onFocusDiagnostic,
  getDiagnosticMessage = (diagnostic) => diagnostic.code,
}: MarkdownSourceEditorProps) {
  const { styles } = useMarkdownSourceEditorStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onFocusDiagnosticRef = useRef(onFocusDiagnostic);
  const getDiagnosticMessageRef = useRef(getDiagnosticMessage);
  const initialValueRef = useRef(value);
  const initialAriaLabelRef = useRef(ariaLabel);
  const applyingControlledValueRef = useRef(false);

  useImperativeHandle(searchRef, () => createMarkdownSearchHandle(() => viewRef.current), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onFocusDiagnosticRef.current = onFocusDiagnostic;
  }, [onFocusDiagnostic]);

  useEffect(() => {
    getDiagnosticMessageRef.current = getDiagnosticMessage;
  }, [getDiagnosticMessage]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          markdownSearchExtension,
          drawSelection(),
          dropCursor(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle),
          markdown(),
          lintGutter(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": initialAriaLabelRef.current,
          }),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...lintKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingControlledValueRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.contentDOM.setAttribute("aria-label", ariaLabel);
  }, [ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    applyingControlledValueRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingControlledValueRef.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(
      setDiagnostics(
        view.state,
        toCodeMirrorDiagnostics(
          view,
          diagnostics,
          getDiagnosticMessageRef.current,
          onFocusDiagnosticRef.current,
        ),
      ),
    );
  }, [diagnostics, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !focusRequest) return;
    const { diagnostic } = focusRequest;
    const lineNumber = Math.min(
      Math.max(1, diagnostic.line),
      view.state.doc.lines,
    );
    const line = view.state.doc.line(lineNumber);
    const anchor = Math.min(
      line.to,
      line.from + Math.max(0, diagnostic.column - 1),
    );
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
    onFocusDiagnosticRef.current(diagnostic);
  }, [focusRequest]);

  return (
    <div
      ref={containerRef}
      className={styles.root}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
        ) {
          event.stopPropagation();
        }
      }}
    />
  );
}
