import { createStore } from "zustand/vanilla";

import {
  createSelectionForBlock,
  type ResumeEditorSelection,
} from "@/domain/resume/editor-selection";
import {
  createBlockFromPreset,
  type BlockPresetId,
} from "@/domain/resume/block-presets";
import { createSectionFromPreset, type SectionPresetId } from "@/domain/resume/presets";
import {
  appendSectionToDocument,
  appendBlockToSectionDocument,
  cloneSectionWithFreshIds,
  cloneBlockWithFreshIds,
  cloneListItemWithFreshIds,
  createDefaultSection,
  findBlockByPath,
  findInnermostListItemAtPath,
  insertBlockAfterDocument,
  insertListItemAfterDocument,
  insertSectionAfterDocument,
  moveBlockInDocument,
  moveSectionInDocument,
  removeBlockFromDocument,
  removeListItemFromDocument,
  removeSectionFromDocument,
  setSectionTitleColorInDocument,
  setSectionTitleFontSizeInDocument,
  setSectionTitleInDocument,
  setTextBlockColorInDocument,
  setSectionVisibilityInDocument,
  updateBlockSettingsInDocument,
  updateSectionPaginationInDocument,
  updateSectionLayoutInDocument,
  updateSectionSemanticInDocument,
  updateSectionTitleInDocument,
  updateBadgeItemsInDocument,
  updateTextBlockContentInDocument,
  updateTextBlockStyleInDocument,
  updateTextBlockInDocument,
  type ResumeBlockSettings,
} from "@/domain/resume/operations";
import type {
  BadgeBlock,
  ResumeDocument,
  RichTextContent,
  TextBlock,
} from "@/domain/resume/schema";
import type { ResumeValidationIssue } from "@/domain/resume/validation";
import { resolveLocale } from "@/i18n/messages";
import type { LocalResumeDraft } from "@/lib/resume-drafts";

export const RESUME_EDITOR_ZOOM_MIN = 0.6;
export const RESUME_EDITOR_ZOOM_MAX = 1.6;
export const RESUME_EDITOR_ZOOM_STEP = 0.1;

export type ResumeEditorSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

function clampZoom(zoom: number) {
  return Math.min(RESUME_EDITOR_ZOOM_MAX, Math.max(RESUME_EDITOR_ZOOM_MIN, zoom));
}

export interface ResumeEditorState {
  resumeId: string;
  document: ResumeDocument;
  version: number;
  updatedAt: number;
  selection: ResumeEditorSelection;
  dirty: boolean;
  saveStatus: ResumeEditorSaveStatus;
  saveConflict?: {
    currentVersion: number;
  };
  saveValidation?: {
    issues: ResumeValidationIssue[];
  };
  recoveryDraft?: LocalResumeDraft;
  zoom: number;
  history: {
    past: ResumeDocument[];
    future: ResumeDocument[];
  };
}

export interface ResumeEditorActions {
  setSelection: (selection: ResumeEditorSelection) => void;
  updateDocument: (
    updater: (document: ResumeDocument) => ResumeDocument,
  ) => void;
  updateTextBlock: (params: {
    sectionId: string;
    blockPath: string[];
    text: string;
  }) => void;
  updateTextBlockContent: (params: {
    sectionId: string;
    blockPath: string[];
    content: RichTextContent;
  }) => void;
  updateSectionTitle: (params: {
    sectionId: string;
    content: RichTextContent;
  }) => void;
  setSectionTitle: (params: {
    sectionId: string;
    title?: RichTextContent;
  }) => void;
  setSectionTitleColor: (params: {
    sectionId: string;
    color?: string;
  }) => void;
  setSectionTitleFontSize: (params: {
    sectionId: string;
    fontSize?: number;
  }) => void;
  updateSectionLayout: (params: {
    sectionId: string;
    layout: Partial<NonNullable<ResumeDocument["sections"][number]["layout"]>>;
  }) => void;
  updateSectionPagination: (params: {
    sectionId: string;
    pagination: Partial<
      NonNullable<ResumeDocument["sections"][number]["pagination"]>
    >;
  }) => void;
  updateSectionSemantic: (params: {
    sectionId: string;
    semantic?: string;
  }) => void;
  updateTextBlockStyle: (params: {
    sectionId: string;
    blockPath: string[];
    style: Partial<NonNullable<TextBlock["style"]>>;
  }) => void;
  setTextBlockColor: (params: {
    sectionId: string;
    blockPath: string[];
    color: string;
  }) => void;
  updateBadgeItems: (params: {
    sectionId: string;
    blockPath: string[];
    items: BadgeBlock["items"];
  }) => void;
  updateBlockSettings: (params: {
    sectionId: string;
    blockPath: string[];
    settings: ResumeBlockSettings;
  }) => void;
  moveBlock: (params: {
    sectionId: string;
    blockPath: string[];
    toIndex: number;
  }) => void;
  addBlock: (params: {
    sectionId: string;
    blockPath?: string[];
    presetId: BlockPresetId;
  }) => void;
  addSection: (presetId?: SectionPresetId) => void;
  setSectionVisibility: (params: {
    sectionId: string;
    visible: boolean;
  }) => void;
  moveSection: (params: { sectionId: string; toIndex: number }) => void;
  duplicateBlock: (params: { sectionId: string; blockPath: string[] }) => void;
  deleteBlock: (params: { sectionId: string; blockPath: string[] }) => void;
  duplicateSection: (sectionId: string) => void;
  deleteSection: (sectionId: string) => void;
  markSaved: (params: {
    version: number;
    updatedAt: number;
    document?: ResumeDocument;
  }) => void;
  syncMetadataVersion: (params: {
    version: number;
    updatedAt: number;
  }) => void;
  restoreServerVersion: (params: {
    document: ResumeDocument;
    version: number;
    updatedAt: number;
  }) => void;
  keepLocalAfterConflict: (params: {
    version: number;
    updatedAt: number;
  }) => void;
  setSaveConflict: (conflict: { currentVersion: number }) => void;
  clearSaveConflict: () => void;
  setSaveValidation: (validation: { issues: ResumeValidationIssue[] }) => void;
  clearSaveValidation: () => void;
  setRecoveryDraft: (draft: LocalResumeDraft) => void;
  restoreRecoveryDraft: () => void;
  discardRecoveryDraft: () => void;
  setSaveStatus: (status: ResumeEditorSaveStatus) => void;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
}

export type ResumeEditorStoreState = ResumeEditorState & ResumeEditorActions;

function getSelectionAfterSectionDeletion({
  document,
  sectionId,
  selection,
}: {
  document: ResumeDocument;
  sectionId: string;
  selection: ResumeEditorSelection;
}): ResumeEditorSelection {
  if (selection.sectionId !== sectionId) {
    return selection;
  }

  const deletedSectionIndex = document.sections.findIndex(
    (section) => section.id === sectionId,
  );

  if (deletedSectionIndex === -1) {
    return selection;
  }

  const remainingSections = document.sections.filter(
    (section) => section.id !== sectionId,
  );
  const fallbackSection =
    remainingSections[deletedSectionIndex] ??
    remainingSections[deletedSectionIndex - 1];

  return fallbackSection ? { sectionId: fallbackSection.id } : {};
}

export function createResumeEditorStore({
  resumeId,
  document,
  version,
  updatedAt,
}: {
  resumeId: string;
  document: ResumeDocument;
  version: number;
  updatedAt: number;
}) {
  return createStore<ResumeEditorStoreState>()((set, get) => ({
    resumeId,
    document,
    version,
    updatedAt,
    selection: {},
    dirty: false,
    saveStatus: "idle",
    saveConflict: undefined,
    saveValidation: undefined,
    recoveryDraft: undefined,
    zoom: 1,
    history: {
      past: [],
      future: [],
    },
    setSelection: (selection) => {
      set({ selection });
    },
    updateDocument: (updater) => {
      const current = get();
      const nextDocument = updater(current.document);

      set({
        document: nextDocument,
        dirty: true,
        saveStatus: "dirty",
        saveValidation: undefined,
        history: {
          past: [...current.history.past, current.document],
          future: [],
        },
      });
    },
    updateTextBlock: ({ sectionId, blockPath, text }) => {
      get().updateDocument((document) =>
        updateTextBlockInDocument({
          document,
          sectionId,
          blockPath,
          text,
        }),
      );
    },
    updateTextBlockContent: ({ sectionId, blockPath, content }) => {
      get().updateDocument((document) =>
        updateTextBlockContentInDocument({
          document,
          sectionId,
          blockPath,
          content,
        }),
      );
    },
    updateSectionTitle: ({ sectionId, content }) => {
      get().updateDocument((document) =>
        updateSectionTitleInDocument({
          document,
          sectionId,
          content,
        }),
      );
    },
    setSectionTitle: ({ sectionId, title }) => {
      get().updateDocument((document) =>
        setSectionTitleInDocument({ document, sectionId, title }),
      );
    },
    setSectionTitleColor: ({ sectionId, color }) => {
      get().updateDocument((document) =>
        setSectionTitleColorInDocument({ document, sectionId, color }),
      );
    },
    setSectionTitleFontSize: ({ sectionId, fontSize }) => {
      get().updateDocument((document) =>
        setSectionTitleFontSizeInDocument({ document, sectionId, fontSize }),
      );
    },
    updateSectionLayout: ({ sectionId, layout }) => {
      get().updateDocument((document) =>
        updateSectionLayoutInDocument({
          document,
          sectionId,
          layout,
        }),
      );
    },
    updateSectionPagination: ({ sectionId, pagination }) => {
      get().updateDocument((document) =>
        updateSectionPaginationInDocument({
          document,
          sectionId,
          pagination,
        }),
      );
    },
    updateSectionSemantic: ({ sectionId, semantic }) => {
      get().updateDocument((document) =>
        updateSectionSemanticInDocument({
          document,
          sectionId,
          semantic,
        }),
      );
    },
    updateTextBlockStyle: ({ sectionId, blockPath, style }) => {
      get().updateDocument((document) =>
        updateTextBlockStyleInDocument({
          document,
          sectionId,
          blockPath,
          style,
        }),
      );
    },
    setTextBlockColor: ({ sectionId, blockPath, color }) => {
      get().updateDocument((document) =>
        setTextBlockColorInDocument({
          document,
          sectionId,
          blockPath,
          color,
        }),
      );
    },
    updateBadgeItems: ({ sectionId, blockPath, items }) => {
      get().updateDocument((document) =>
        updateBadgeItemsInDocument({
          document,
          sectionId,
          blockPath,
          items,
        }),
      );
    },
    updateBlockSettings: ({ sectionId, blockPath, settings }) => {
      get().updateDocument((document) =>
        updateBlockSettingsInDocument({
          document,
          sectionId,
          blockPath,
          settings,
        }),
      );
    },
    moveBlock: ({ sectionId, blockPath, toIndex }) => {
      get().updateDocument((document) =>
        moveBlockInDocument({
          document,
          sectionId,
          blockPath,
          toIndex,
        }),
      );
    },
    addBlock: ({ sectionId, blockPath, presetId }) => {
      const locale = resolveLocale(get().document.meta.locale);
      const block = createBlockFromPreset(presetId, locale);
      const parentPath = blockPath?.slice(0, -1) ?? [];

      get().updateDocument((document) =>
        blockPath?.length
          ? insertBlockAfterDocument({
              document,
              sectionId,
              blockPath,
              block,
            })
          : appendBlockToSectionDocument({
              document,
              sectionId,
              block,
            }),
      );
      set({
        selection: createSelectionForBlock(sectionId, block, parentPath),
      });
    },
    addSection: (presetId) => {
      const locale = resolveLocale(get().document.meta.locale);
      const nextSection = presetId
        ? createSectionFromPreset(presetId, locale)
        : createDefaultSection(locale);

      get().updateDocument((document) =>
        appendSectionToDocument(document, nextSection),
      );
      set({
        selection: {
          sectionId: nextSection.id,
        },
      });
    },
    setSectionVisibility: ({ sectionId, visible }) => {
      get().updateDocument((document) =>
        setSectionVisibilityInDocument({
          document,
          sectionId,
          visible,
        }),
      );
    },
    moveSection: ({ sectionId, toIndex }) => {
      get().updateDocument((document) =>
        moveSectionInDocument({
          document,
          sectionId,
          toIndex,
        }),
      );
    },
    duplicateBlock: ({ sectionId, blockPath }) => {
      const section = get().document.sections.find((item) => item.id === sectionId);
      const source = section ? findBlockByPath(section.blocks, blockPath) : undefined;

      if (!section || !source) {
        return;
      }

      const listItemTarget = findInnermostListItemAtPath(
        section.blocks,
        blockPath,
      );

      if (listItemTarget) {
        const copy = cloneListItemWithFreshIds(listItemTarget.item);
        const firstCopyBlock = copy.children[0];

        get().updateDocument((document) =>
          insertListItemAfterDocument({
            document,
            sectionId,
            listPath: listItemTarget.listPath,
            itemId: listItemTarget.item.id,
            item: copy,
          }),
        );
        set({
          selection: firstCopyBlock
            ? {
                sectionId,
                blockPath: [...listItemTarget.listPath, copy.id, firstCopyBlock.id],
                richTextField: firstCopyBlock.type === "text" ? "content" : undefined,
              }
            : { sectionId },
        });
        return;
      }

      const copy = cloneBlockWithFreshIds(source);

      get().updateDocument((document) =>
        insertBlockAfterDocument({
          document,
          sectionId,
          blockPath,
          block: copy,
        }),
      );
      set({
        selection: {
          sectionId,
          blockPath: [...blockPath.slice(0, -1), copy.id],
          richTextField: copy.type === "text" ? "content" : undefined,
        },
      });
    },
    deleteBlock: ({ sectionId, blockPath }) => {
      const section = get().document.sections.find((item) => item.id === sectionId);
      const source = section ? findBlockByPath(section.blocks, blockPath) : undefined;

      if (!section || !source) {
        return;
      }

      const listItemTarget = findInnermostListItemAtPath(
        section.blocks,
        blockPath,
      );

      if (listItemTarget) {
        const listBlock = findBlockByPath(section.blocks, listItemTarget.listPath);

        if (listBlock?.type !== "list") {
          return;
        }

        const sourceIndex = listBlock.items.findIndex(
          (item) => item.id === listItemTarget.item.id,
        );
        const fallbackItem =
          listBlock.items[sourceIndex + 1] ?? listBlock.items[sourceIndex - 1];
        const fallbackBlock = fallbackItem?.children[0];

        get().updateDocument((document) =>
          removeListItemFromDocument({
            document,
            sectionId,
            listPath: listItemTarget.listPath,
            itemId: listItemTarget.item.id,
          }),
        );
        set({
          selection:
            fallbackItem && fallbackBlock
              ? {
                  sectionId,
                  blockPath: [
                    ...listItemTarget.listPath,
                    fallbackItem.id,
                    fallbackBlock.id,
                  ],
                  richTextField: fallbackBlock.type === "text" ? "content" : undefined,
                }
              : { sectionId },
        });
        return;
      }

      get().updateDocument((document) =>
        removeBlockFromDocument({ document, sectionId, blockPath }),
      );
      set({ selection: { sectionId } });
    },
    duplicateSection: (sectionId) => {
      const source = get().document.sections.find((section) => section.id === sectionId);

      if (!source) {
        return;
      }

      const copy = cloneSectionWithFreshIds(source);

      get().updateDocument((document) =>
        insertSectionAfterDocument({
          document,
          sectionId,
          section: copy,
        }),
      );
      set({
        selection: {
          sectionId: copy.id,
        },
      });
    },
    deleteSection: (sectionId) => {
      const current = get();

      if (current.document.sections.length <= 1) {
        return;
      }

      const nextSelection = getSelectionAfterSectionDeletion({
        document: current.document,
        sectionId,
        selection: current.selection,
      });

      get().updateDocument((document) =>
        removeSectionFromDocument({
          document,
          sectionId,
        }),
      );
      set({
        selection: nextSelection,
      });
    },
    markSaved: ({ version, updatedAt, document: savedDocument }) => {
      const hasNewerEdits =
        savedDocument !== undefined && get().document !== savedDocument;

      set({
        version,
        updatedAt,
        dirty: hasNewerEdits,
        saveStatus: hasNewerEdits ? "dirty" : "saved",
        saveConflict: undefined,
        saveValidation: undefined,
      });
    },
    syncMetadataVersion: ({ version, updatedAt }) => {
      set({ version, updatedAt });
    },
    restoreServerVersion: ({ document, version, updatedAt }) => {
      set({
        document,
        version,
        updatedAt,
        selection: {},
        dirty: false,
        saveStatus: "saved",
        saveConflict: undefined,
        saveValidation: undefined,
        recoveryDraft: undefined,
        history: {
          past: [],
          future: [],
        },
      });
    },
    keepLocalAfterConflict: ({ version, updatedAt }) => {
      set({
        version,
        updatedAt,
        dirty: true,
        saveStatus: "dirty",
        saveConflict: undefined,
        saveValidation: undefined,
      });
    },
    setSaveConflict: (saveConflict) => {
      set({
        saveConflict,
        saveValidation: undefined,
        saveStatus: "error",
      });
    },
    clearSaveConflict: () => {
      set({
        saveConflict: undefined,
      });
    },
    setSaveValidation: (saveValidation) => {
      set({
        saveConflict: undefined,
        saveValidation,
        saveStatus: "error",
      });
    },
    clearSaveValidation: () => {
      set({
        saveValidation: undefined,
      });
    },
    setRecoveryDraft: (recoveryDraft) => {
      set({ recoveryDraft });
    },
    restoreRecoveryDraft: () => {
      const recoveryDraft = get().recoveryDraft;

      if (!recoveryDraft) return;

      set({
        document: recoveryDraft.document,
        version: recoveryDraft.baseVersion,
        updatedAt: recoveryDraft.updatedAt,
        recoveryDraft: undefined,
        dirty: true,
        saveStatus: "dirty",
      });
    },
    discardRecoveryDraft: () => {
      set({ recoveryDraft: undefined });
    },
    setSaveStatus: (saveStatus) => {
      set({ saveStatus });
    },
    setZoom: (zoom) => {
      set({ zoom: clampZoom(zoom) });
    },
    undo: () => {
      const current = get();
      const previous = current.history.past.at(-1);

      if (!previous) return;

      set({
        document: previous,
        dirty: true,
        saveStatus: "dirty",
        history: {
          past: current.history.past.slice(0, -1),
          future: [current.document, ...current.history.future],
        },
      });
    },
    redo: () => {
      const current = get();
      const [next, ...remaining] = current.history.future;

      if (!next) return;

      set({
        document: next,
        dirty: true,
        saveStatus: "dirty",
        history: {
          past: [...current.history.past, current.document],
          future: remaining,
        },
      });
    },
  }));
}
