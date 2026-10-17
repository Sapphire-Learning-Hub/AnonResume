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
  type ResumeMarkdownProjection,
} from "@/domain/resume/markdown";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { AppLocale } from "@/i18n/messages";
import {
  createResumeMarkdownDraftRepository,
  LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
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
  const [hasSourceChanges, setHasSourceChanges] = useState(false);
  const activeProjectionRef = useRef<ResumeMarkdownProjection>(
    serializeResumeMarkdown(initialDocument, {
      baseDocumentVersion: store.getState().version,
    }).projection,
  );
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

  const deleteSourceDraft = async () => {
    try {
      await draftRepository.deleteDraft(resumeId);
    } catch {
      // Local source recovery is best-effort and must not block editor controls.
    }
  };

  const setSource = (nextSource: string) => {
    const current = store.getState();
    const formatted = formatResumeMarkdown(
      nextSource,
      current.document,
      locale,
      {
        baseDocumentVersion: current.version,
        projection: activeProjectionRef.current,
      },
    );
    setSourceState(nextSource);
    setHasSourceChanges(true);
    setDiagnostics(formatted.result.diagnostics);

    if (formatted.result.hasErrors || !formatted.result.document) {
      clearCommitTimer();
      setIsPreviewStale(true);
    } else {
      activeProjectionRef.current = formatted.projection;
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

    void draftRepository
      .saveDraft({
        schemaVersion: LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
        resumeId,
        source: nextSource,
        baseVersion: current.version,
        updatedAt: Date.now(),
        projection: activeProjectionRef.current,
      })
      .catch(() => undefined);
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
    const serialized = serializeResumeMarkdown(current.document, {
      baseDocumentVersion: current.version,
    });
    activeProjectionRef.current = serialized.projection;
    setSourceState(serialized.source);
    setPreviewDocument(current.document);
    setDiagnostics([]);
    setIsPreviewStale(false);
    setHasSourceChanges(false);
    try {
      setRecoveryDraft(await draftRepository.getDraft(resumeId));
    } catch {
      setRecoveryDraft(undefined);
    }
    setActive(true);
  };

  const recoverDraftSource = () => {
    if (!recoveryDraft) return;
    activeProjectionRef.current = recoveryDraft.projection;
    setSource(recoveryDraft.source);
    setRecoveryDraft(undefined);
  };

  const dismissRecovery = async () => {
    setRecoveryDraft(undefined);
    await deleteSourceDraft();
  };

  const flush = async () => {
    const current = store.getState();
    const formatted = formatResumeMarkdown(
      source,
      current.document,
      locale,
      {
        baseDocumentVersion: current.version,
        projection: activeProjectionRef.current,
      },
    );
    setDiagnostics(formatted.result.diagnostics);
    if (formatted.result.hasErrors || !formatted.result.document) {
      setIsPreviewStale(true);
      return false;
    }
    activeProjectionRef.current = formatted.projection;
    clearCommitTimer();
    if (formatted.semanticChanged) {
      store.getState().replaceDocument({
        document: formatted.result.document,
        history: "record",
      });
    }
    setPreviewDocument(formatted.result.document);
    setIsPreviewStale(false);
    return true;
  };

  const exit = async () => {
    if (!(await flush())) return false;
    const formatted = formatResumeMarkdown(
      source,
      store.getState().document,
      locale,
      {
        baseDocumentVersion: store.getState().version,
        projection: activeProjectionRef.current,
      },
    );
    if (!formatted.result.document) return false;
    activeProjectionRef.current = formatted.projection;
    setSourceState(formatted.source);
    setPreviewDocument(formatted.result.document);
    setIsPreviewStale(false);
    setHasSourceChanges(false);
    setActive(false);
    setRecoveryDraft(undefined);
    await deleteSourceDraft();
    return true;
  };

  const discard = async () => {
    clearCommitTimer();
    const current = store.getState();
    const serialized = serializeResumeMarkdown(current.document, {
      baseDocumentVersion: current.version,
    });
    activeProjectionRef.current = serialized.projection;
    setSourceState(serialized.source);
    setPreviewDocument(current.document);
    setDiagnostics([]);
    setIsPreviewStale(false);
    setHasSourceChanges(false);
    setRecoveryDraft(undefined);
    setActive(false);
    await deleteSourceDraft();
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
    hasSourceChanges,
    enter,
    flush,
    exit,
    discard,
    dismissRecovery,
    recoverDraft: recoverDraftSource,
  };
}
