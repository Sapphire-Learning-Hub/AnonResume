"use client";

import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";

import {
  ResumeValidationClientError,
  ResumeVersionConflictClientError,
} from "@/lib/resume/client";
import type { ResumeDraftRepository } from "@/lib/resume/drafts";
import type { ResumeEditorStoreState } from "@/stores/resume-editor";

export function useResumePersistence({
  store,
  draftRepository,
  saveDocument,
  flushSave,
  debounceMs,
  initialUpdatedAt,
}: {
  store: StoreApi<ResumeEditorStoreState>;
  draftRepository: ResumeDraftRepository;
  saveDocument: (params: {
    resumeId: string;
    version: number;
    document: ResumeEditorStoreState["document"];
  }) => Promise<{ version: number; updatedAt: number }>;
  flushSave?: () => Promise<void>;
  debounceMs: number;
  initialUpdatedAt: number;
}) {
  useEffect(() => {
    let cancelled = false;

    void draftRepository.getDraft(store.getState().resumeId).then((draft) => {
      if (!draft || cancelled) return;
      if (draft.updatedAt <= initialUpdatedAt) return;

      store.getState().setRecoveryDraft(draft);
    });

    return () => {
      cancelled = true;
    };
  }, [draftRepository, initialUpdatedAt, store]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const unsubscribe = store.subscribe((state, previousState) => {
      if (!state.dirty) return;
      if (
        state.document === previousState.document &&
        state.version === previousState.version
      ) {
        return;
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(async () => {
        const snapshot = store.getState();

        if (!snapshot.dirty) return;

        const localDraft = {
          resumeId: snapshot.resumeId,
          document: snapshot.document,
          baseVersion: snapshot.version,
          updatedAt: Date.now(),
        };

        await draftRepository.saveDraft(localDraft);

        if (flushSave) {
          try {
            await flushSave();

            if (!store.getState().dirty) {
              await draftRepository.deleteDraft(snapshot.resumeId);
            }
          } catch {
            // flushSave is responsible for storing the failure state on the editor store.
          }

          return;
        }

        store.getState().setSaveStatus("saving");

        try {
          const result = await saveDocument({
            resumeId: snapshot.resumeId,
            version: snapshot.version,
            document: snapshot.document,
          });

          store.getState().markSaved({
            ...result,
            document: snapshot.document,
          });

          if (!store.getState().dirty) {
            await draftRepository.deleteDraft(snapshot.resumeId);
          }
        } catch (error) {
          if (error instanceof ResumeVersionConflictClientError) {
            store.getState().setSaveConflict({
              currentVersion: error.currentVersion,
            });

            return;
          }

          if (error instanceof ResumeValidationClientError) {
            store.getState().setSaveValidation({
              issues: error.issues,
            });

            return;
          }

          store.getState().setSaveStatus("error");
        }
      }, debounceMs);
    });

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      unsubscribe();
    };
  }, [debounceMs, draftRepository, flushSave, saveDocument, store]);
}
