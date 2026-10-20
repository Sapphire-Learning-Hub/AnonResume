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
  resumeMarkdownDocumentsEqual,
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
  const [diagnostics, setDiagnostics] = useState<ResumeMarkdownDiagnostic[]>(
    [],
  );
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
  const mappingDocumentRef = useRef(initialDocument);
  const committedDocumentRef = useRef(initialDocument);
  const recoveryBlockedRef = useRef(false);
  const blockedDraftRef = useRef<LocalResumeMarkdownDraft | undefined>(
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

  const hasConflict = () =>
    recoveryBlockedRef.current ||
    !resumeMarkdownDocumentsEqual(
      store.getState().document,
      committedDocumentRef.current,
    );

  const showConflict = () => {
    clearCommitTimer();
    setDiagnostics([
      {
        severity: "error",
        code: "projection_conflict",
        line: 1,
        column: 1,
        parameters: {},
      },
    ]);
    setIsPreviewStale(true);
  };

  const parseSource = (nextSource: string) => {
    const current = store.getState();
    return formatResumeMarkdown(
      nextSource,
      mappingDocumentRef.current,
      locale,
      {
        baseDocumentVersion: current.version,
        // Save acknowledgements change the server version, not this session's
        // document identity. Rebase only after verifying our committed baseline.
        projection: {
          ...activeProjectionRef.current,
          baseDocumentVersion: current.version,
        },
      },
    );
  };

  const commitDocument = (document: ResumeDocument) => {
    if (hasConflict()) {
      showConflict();
      return false;
    }
    if (!resumeMarkdownDocumentsEqual(store.getState().document, document)) {
      store.getState().replaceDocument({ document, history: "record" });
    }
    committedDocumentRef.current = store.getState().document;
    return true;
  };

  const setSource = (nextSource: string) => {
    const current = store.getState();
    setSourceState(nextSource);
    setHasSourceChanges(true);
    if (hasConflict()) {
      showConflict();
    } else {
      const formatted = parseSource(nextSource);
      setDiagnostics(formatted.result.diagnostics);

      if (formatted.result.hasErrors || !formatted.result.document) {
        clearCommitTimer();
        setIsPreviewStale(true);
      } else {
        activeProjectionRef.current = formatted.projection;
        mappingDocumentRef.current = formatted.result.document;
        setIsPreviewStale(false);
        startTransition(() => setPreviewDocument(formatted.result.document!));
        clearCommitTimer();
        if (
          !resumeMarkdownDocumentsEqual(
            current.document,
            formatted.result.document,
          )
        ) {
          const candidate = formatted.result.document;
          commitTimerRef.current = setTimeout(() => {
            commitDocument(candidate);
            commitTimerRef.current = undefined;
          }, commitDelayMs);
        }
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
        baseDocument: blockedDraftRef.current
          ? blockedDraftRef.current.baseDocument
          : committedDocumentRef.current,
        projectionDocument: blockedDraftRef.current
          ? blockedDraftRef.current.projectionDocument
          : mappingDocumentRef.current,
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
    mappingDocumentRef.current = current.document;
    committedDocumentRef.current = current.document;
    recoveryBlockedRef.current = false;
    blockedDraftRef.current = undefined;
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
    recoveryBlockedRef.current =
      !recoveryDraft.baseDocument ||
      !recoveryDraft.projectionDocument ||
      (!resumeMarkdownDocumentsEqual(
        recoveryDraft.baseDocument,
        store.getState().document,
      ) &&
        !resumeMarkdownDocumentsEqual(
          recoveryDraft.projectionDocument,
          store.getState().document,
        ));
    blockedDraftRef.current = recoveryBlockedRef.current
      ? recoveryDraft
      : undefined;
    activeProjectionRef.current = recoveryDraft.projection;
    mappingDocumentRef.current =
      recoveryDraft.projectionDocument ?? mappingDocumentRef.current;
    setSource(recoveryDraft.source);
    setRecoveryDraft(undefined);
  };

  const dismissRecovery = async () => {
    setRecoveryDraft(undefined);
    await deleteSourceDraft();
  };

  const flush = async () => {
    if (hasConflict()) {
      showConflict();
      return false;
    }
    const formatted = parseSource(source);
    setDiagnostics(formatted.result.diagnostics);
    if (formatted.result.hasErrors || !formatted.result.document) {
      setIsPreviewStale(true);
      return false;
    }
    activeProjectionRef.current = formatted.projection;
    mappingDocumentRef.current = formatted.result.document;
    clearCommitTimer();
    if (!commitDocument(formatted.result.document)) return false;
    setPreviewDocument(formatted.result.document);
    setIsPreviewStale(false);
    return true;
  };

  const exit = async () => {
    if (!(await flush())) return false;
    const formatted = parseSource(source);
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
    mappingDocumentRef.current = current.document;
    committedDocumentRef.current = current.document;
    recoveryBlockedRef.current = false;
    blockedDraftRef.current = undefined;
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
      (recoveryDraft.baseVersion !== store.getState().version ||
        !recoveryDraft.baseDocument ||
        !recoveryDraft.projectionDocument ||
        (!resumeMarkdownDocumentsEqual(
          recoveryDraft.baseDocument,
          store.getState().document,
        ) &&
          !resumeMarkdownDocumentsEqual(
            recoveryDraft.projectionDocument,
            store.getState().document,
          ))),
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
