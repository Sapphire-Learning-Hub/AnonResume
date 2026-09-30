"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { ResumePageBreakMap } from "@/domain/resume/page-flow/break-map";
import type { ResumePageLayout } from "@/domain/resume/pagination";

import type {
  TiptapPaginationRequestReason,
  TiptapTextBlockEditorEditingState,
} from "../TiptapTextBlockEditor";
import {
  createEditPaginationScheduler,
  type EditPaginationPriority,
  type EditPaginationReason,
  type EditPaginationRevision,
  type EditPaginationScheduler,
  type EditPaginationWork,
} from "./edit-pagination-scheduler";

export interface ResumeEditPaginationSnapshot {
  pages: ResumePageLayout[];
  breaks: ResumePageBreakMap;
}

interface UseResumeEditPaginationInput {
  rootRef: RefObject<HTMLElement | null>;
  initialPages: ResumePageLayout[];
  initialBreaks: ResumePageBreakMap;
  documentKey: string;
  geometryKey: string;
  createWork: (
    revision: EditPaginationRevision,
  ) => EditPaginationWork<ResumeEditPaginationSnapshot> | undefined;
}

interface RevisionKeys {
  document: string;
  geometry: string;
}

const IMMEDIATE_REASONS = new Set<EditPaginationReason>([
  "document",
  "paste",
  "drop",
  "history",
  "format",
  "structure",
  "compositionEnd",
  "geometry",
  "width",
]);

function priorityForReason(
  reason: EditPaginationReason,
): EditPaginationPriority {
  return IMMEDIATE_REASONS.has(reason) ? "immediate" : "normal";
}

export function useResumeEditPagination({
  rootRef,
  initialPages,
  initialBreaks,
  documentKey,
  geometryKey,
  createWork,
}: UseResumeEditPaginationInput) {
  const [snapshot, setSnapshot] = useState<ResumeEditPaginationSnapshot>({
    pages: initialPages,
    breaks: initialBreaks,
  });
  const [ready, setReady] = useState(false);
  const [editingState, setEditingState] =
    useState<TiptapTextBlockEditorEditingState>({
      focused: false,
      composing: false,
    });
  const createWorkRef = useRef(createWork);
  const revisionRef = useRef<EditPaginationRevision>({
    document: 0,
    geometry: 0,
    width: 0,
  });
  const schedulerRef = useRef<EditPaginationScheduler>(undefined);
  const revisionKeysRef = useRef<RevisionKeys>({
    document: documentKey,
    geometry: geometryKey,
  });
  const pendingInputReasonRef = useRef<EditPaginationReason>("document");
  useLayoutEffect(() => {
    const scheduler = createEditPaginationScheduler<ResumeEditPaginationSnapshot>({
      getRevision: () => revisionRef.current,
      createWork: ({ revision }) => createWorkRef.current(revision),
      commit: (result) => {
        setSnapshot(result);
        setReady(true);
      },
    });
    schedulerRef.current = scheduler;

    return () => {
      scheduler.dispose();
      schedulerRef.current = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    createWorkRef.current = createWork;
  }, [createWork]);

  useLayoutEffect(() => {
    let reason: EditPaginationReason | undefined;

    if (revisionKeysRef.current.document !== documentKey) {
      revisionKeysRef.current.document = documentKey;
      revisionRef.current = {
        ...revisionRef.current,
        document: revisionRef.current.document + 1,
      };
      reason = pendingInputReasonRef.current;
      pendingInputReasonRef.current = "document";
    }

    if (revisionKeysRef.current.geometry !== geometryKey) {
      revisionKeysRef.current.geometry = geometryKey;
      revisionRef.current = {
        ...revisionRef.current,
        geometry: revisionRef.current.geometry + 1,
      };
      reason = "geometry";
    }

    if (!ready && !reason) {
      reason = "initial";
    }

    if (reason) {
      setReady(false);
      schedulerRef.current?.schedule(reason, priorityForReason(reason));
    }
  }, [documentKey, geometryKey, ready]);

  useEffect(() => {
    const root = rootRef.current;

    if (!root || typeof ResizeObserver === "undefined") return;

    let previousWidth = root.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? root.getBoundingClientRect().width;

      if (Math.abs(width - previousWidth) < 0.5) return;

      previousWidth = width;
      revisionRef.current = {
        ...revisionRef.current,
        width: revisionRef.current.width + 1,
      };
      setReady(false);
      schedulerRef.current?.schedule("width", "immediate");
    });

    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const fonts = document.fonts;

    if (!fonts) return;
    let active = true;

    const requestFontPagination = () => {
      if (!active) return;

      revisionRef.current = {
        ...revisionRef.current,
        geometry: revisionRef.current.geometry + 1,
      };
      setReady(false);
      schedulerRef.current?.schedule("geometry", "immediate");
    };

    void fonts.ready.then(requestFontPagination);
    fonts.addEventListener?.("loadingdone", requestFontPagination);

    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", requestFontPagination);
    };
  }, []);

  const requestPagination = useCallback(
    (reason: TiptapPaginationRequestReason | "structure") => {
      pendingInputReasonRef.current = reason;
      revisionRef.current = {
        ...revisionRef.current,
        document: revisionRef.current.document + 1,
      };
      setReady(false);
      schedulerRef.current?.schedule(reason, priorityForReason(reason));
    },
    [],
  );

  const handleEditingStateChange = useCallback(
    (nextState: TiptapTextBlockEditorEditingState) => {
      setEditingState((currentState) =>
        currentState.focused === nextState.focused &&
        currentState.composing === nextState.composing
          ? currentState
          : nextState,
      );
      schedulerRef.current?.setComposing(nextState.composing);
    },
    [],
  );

  return {
    pages: snapshot.pages,
    breaks: snapshot.breaks,
    ready,
    pageCount: snapshot.pages.length,
    requestPagination,
    editingState,
    onEditingStateChange: handleEditingStateChange,
  };
}
