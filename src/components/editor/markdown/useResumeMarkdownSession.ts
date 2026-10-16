"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import type { StoreApi } from "zustand";

import {
  formatResumeMarkdown,
  serializeResumeMarkdown,
  type ResumeMarkdownDiagnostic,
} from "@/domain/resume/markdown";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { AppLocale } from "@/i18n/messages";
import {
  createResumeMarkdownDraftRepository,
  type LocalResumeMarkdownDraft,
  type ResumeMarkdownDraftRepository,
} from "@/lib/resume/markdown-drafts";
import type { ResumeEditorStoreState } from "@/stores/resume-editor";

const defaultDraftRepository = createResumeMarkdownDraftRepository();

export function useResumeMarkdownSession({
  resumeId,
  locale,
  store,
  draftRepository = defaultDraftRepository,
  commitDelayMs = 500,
}: {
  resumeId: string;
  locale: AppLocale;
  store: StoreApi<ResumeEditorStoreState>;
  draftRepository?: ResumeMarkdownDraftRepository;
  commitDelayMs?: number;
}) {
  const initialDocument = store.getState().document;
  const [source, setSourceState] = useState(
    () => serializeResumeMarkdown(initialDocument).source,
  );
  const [previewDocument, setPreviewDocument] =
    useState<ResumeDocument>(initialDocument);
  const [diagnostics, setDiagnostics] = useState<ResumeMarkdownDiagnostic[]>([]);
  const [isPreviewStale, setIsPreviewStale] = useState(false);
  const [recoveryDraft, setRecoveryDraft] =
    useState<LocalResumeMarkdownDraft>();
  const [active, setActive] = useState(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const deferredPreviewDocument = useDeferredValue(previewDocument);

  const clearCommitTimer = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = undefined;
    }
  };

  const setSource = (nextSource: string) => {
    const current = store.getState();
    const formatted = formatResumeMarkdown(
      nextSource,
      current.document,
      locale,
    );
    setSourceState(nextSource);
    setDiagnostics(formatted.result.diagnostics);

    if (formatted.result.hasErrors || !formatted.result.document) {
      clearCommitTimer();
      setIsPreviewStale(true);
    } else {
      setIsPreviewStale(false);
      startTransition(() => setPreviewDocument(formatted.result.document!));
      clearCommitTimer();
      if (formatted.semanticChanged) {
        const candidate = formatted.result.document;
        commitTimerRef.current = setTimeout(() => {
          store.getState().replaceDocument({
            document: candidate!,
            history: "record",
          });
          commitTimerRef.current = undefined;
        }, commitDelayMs);
      }
    }

    void draftRepository.saveDraft({
      resumeId,
      source: nextSource,
      baseVersion: current.version,
      updatedAt: Date.now(),
    });
  };

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const enter = async () => {
    clearCommitTimer();
    const current = store.getState();
    const canonical = serializeResumeMarkdown(current.document).source;
    setSourceState(canonical);
    setPreviewDocument(current.document);
    setDiagnostics([]);
    setIsPreviewStale(false);
    setRecoveryDraft(await draftRepository.getDraft(resumeId));
    setActive(true);
  };

  const recoverDraftSource = () => {
    if (!recoveryDraft) return;
    setSource(recoveryDraft.source);
    setRecoveryDraft(undefined);
  };

  const exit = async () => {
    const current = store.getState();
    const formatted = formatResumeMarkdown(source, current.document, locale);
    setDiagnostics(formatted.result.diagnostics);
    if (formatted.result.hasErrors || !formatted.result.document) {
      setIsPreviewStale(true);
      return false;
    }
    clearCommitTimer();
    if (formatted.semanticChanged) {
      store.getState().replaceDocument({
        document: formatted.result.document,
        history: "record",
      });
    }
    setSourceState(formatted.source);
    setPreviewDocument(formatted.result.document);
    setIsPreviewStale(false);
    setActive(false);
    setRecoveryDraft(undefined);
    await draftRepository.deleteDraft(resumeId);
    return true;
  };

  const discard = async () => {
    clearCommitTimer();
    const currentDocument = store.getState().document;
    setSourceState(serializeResumeMarkdown(currentDocument).source);
    setPreviewDocument(currentDocument);
    setDiagnostics([]);
    setIsPreviewStale(false);
    setRecoveryDraft(undefined);
    setActive(false);
    await draftRepository.deleteDraft(resumeId);
  };

  return {
    source,
    setSource,
    previewDocument: deferredPreviewDocument,
    diagnostics,
    isPreviewStale,
    recoveryDraft,
    recoveryIsStale:
      recoveryDraft !== undefined &&
      recoveryDraft.baseVersion !== store.getState().version,
    active,
    enter,
    exit,
    discard,
    recoverDraft: recoverDraftSource,
  };
}
