"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  Button,
  Checkbox,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import { useStore } from "zustand";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import {
  ResumeSummaryEditor,
  type ResumeSummaryUpdateResult,
} from "@/components/resume/ResumeSummaryEditor";
import { SectionOutline } from "@/components/editor/SectionOutline";
import {
  EditorRibbon,
  EditorRibbonPropertyGroup,
  type EditorRibbonGroup,
  type EditorRibbonTab,
  type EditorRibbonTabItem,
} from "@/components/editor/EditorRibbon";
import { EditorStatusBar } from "@/components/editor/EditorStatusBar";
import { ResumeIconPicker } from "@/components/editor/ResumeIconPicker";
import { ResumeDocumentDiffModal } from "@/components/editor/ResumeDocumentDiffModal";
import { ResumeVersionDiffPrompt } from "@/components/editor/ResumeVersionDiffPrompt";
import { DraftInput } from "@/components/editor/inspector/DraftInput";
import { PaletteColorPicker } from "@/components/ui/PaletteColorPicker";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import {
  DocumentIcon,
  EnterFullscreenIcon,
  ExitFullscreenIcon,
  HelpIcon,
  HomeIcon,
  InsertIcon,
  LayoutIcon,
  PropertiesIcon,
  RedoIcon,
  UndoIcon,
} from "@/components/ui/InlineIcons";
import type {
  TiptapTextBlockEditorCommand,
  TiptapTextBlockEditorFormatState,
  TiptapTextBlockEditorHandle,
} from "@/components/resume/TiptapTextBlockEditor";
import {
  createRichTextFromPlainText,
  findBlockByPath,
  findTextBlock,
  getBlockSiblingPosition,
} from "@/domain/resume/operations";
import { listBlockPresets } from "@/domain/resume/block-presets";
import { listSectionPresets } from "@/domain/resume/presets";
import {
  applyResumeVisualPreset,
  getMatchingResumeVisualPresetId,
  listResumeVisualPresets,
  type ResumeVisualPresetId,
} from "@/domain/resume/style-presets";
import {
  filterResumeFontPresets,
  listResumeFontPresets,
} from "@/domain/resume/font-presets";
import type {
  BadgeBlock,
  RichTextContent,
} from "@/domain/resume/schema";
import {
  createResumeDraftRepository,
  type ResumeDraftRepository,
} from "@/lib/resume/drafts";
import {
  exportResumePdfDocument,
  createResumeVersionSnapshot,
  fetchCurrentResumeDocument,
  fetchResumeVersionSnapshot,
  fetchResumeVersionSnapshots,
  publishResume,
  ResumeValidationClientError,
  ResumeVersionConflictClientError,
  restoreResumeVersion,
  saveResumeDocument,
  unpublishResume,
  updateResumeSummary,
  type ResumeVersionSnapshotDetail,
  type ResumeVersionSnapshotSummary,
} from "@/lib/resume/client";
import {
  createResumeEditorStore,
  RESUME_EDITOR_ZOOM_MAX,
  RESUME_EDITOR_ZOOM_MIN,
  RESUME_EDITOR_ZOOM_STEP,
  type ResumeEditorStoreState,
} from "@/stores/resume-editor";
import { useI18n } from "@/i18n/I18nProvider";
import type { PageResult } from "@/lib/shared/pagination";

import { useResumeEditorShellStyles } from "./ResumeEditorShell.style";
import { getActiveResumePageIndex } from "./resume-page-navigation";
import { useResumePersistence } from "./useResumePersistence";

function formatSaveStatus(
  state: ResumeEditorStoreState["saveStatus"],
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (state) {
    case "idle":
      return t("editor.saveStatus.idle");
    case "dirty":
      return t("editor.saveStatus.dirty");
    case "saving":
      return t("editor.saveStatus.saving");
    case "saved":
      return t("editor.saveStatus.saved");
    case "error":
      return t("editor.saveStatus.error");
  }
}

function getVisualPresetLabel(
  presetId: ResumeVisualPresetId | "custom",
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (presetId) {
    case "balanced":
      return t("editor.visualPreset.balanced");
    case "compact":
      return t("editor.visualPreset.compact");
    case "classic":
      return t("editor.visualPreset.classic");
    case "custom":
      return t("editor.visualPreset.custom");
  }
}

function getFirstLinkHref(content: RichTextContent | undefined) {
  if (!content) return "";

  for (const paragraph of content.content) {
    for (const node of paragraph.content) {
      if (node.type !== "text") continue;

      const linkMark = node.marks?.find((mark) => mark.type === "link");

      if (linkMark?.attrs?.href) {
        return linkMark.attrs.href;
      }
    }
  }

  return "";
}

function getInitialFormattingState(
  content: RichTextContent | undefined,
): TiptapTextBlockEditorFormatState {
  const firstTextNode = content?.content
    .flatMap((paragraph) => paragraph.content)
    .find((node) => node.type === "text");

  if (!firstTextNode || firstTextNode.type !== "text") {
    return {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      tag: false,
      textColor: "",
      linkHref: "",
    };
  }

  return {
    bold: firstTextNode.marks?.some((mark) => mark.type === "bold") ?? false,
    italic: firstTextNode.marks?.some((mark) => mark.type === "italic") ?? false,
    underline:
      firstTextNode.marks?.some((mark) => mark.type === "underline") ?? false,
    strike: firstTextNode.marks?.some((mark) => mark.type === "strike") ?? false,
    tag: firstTextNode.marks?.some((mark) => mark.type === "tag") ?? false,
    textColor:
      firstTextNode.marks?.find((mark) => mark.type === "textColor")?.attrs
        ?.color ?? "",
    linkHref: getFirstLinkHref(content),
  };
}

function preventToolbarMouseDown(event: ReactMouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function parsePositiveNumber(value: string) {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return undefined;
  }

  return nextValue;
}

function parseCommittedPositiveDecimal(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue === "." || trimmedValue.endsWith(".")) {
    return undefined;
  }

  return parsePositiveNumber(trimmedValue);
}

function parseNonNegativeNumber(value: string) {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return undefined;
  }

  return nextValue;
}

function parsePositiveInteger(value: string) {
  const nextValue = Number(value);

  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    return undefined;
  }

  return nextValue;
}

function formatZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

function formatVersionTimestamp(createdAt: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(createdAt);
}

function isNativeEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.matches("input, textarea, select") ||
    Boolean(target.closest("[contenteditable='true'], input, textarea, select"))
  );
}

type EditSurfaceMode = "content" | "layout";

export function ResumeEditorShell({
  resumeId,
  publicSlug,
  initialDocument,
  initialSummary = "",
  initialVersion = 1,
  initialUpdatedAt = 0,
  autosaveDelayMs = 800,
  draftRepository,
  saveDocument,
  publishDocument,
  unpublishDocument,
  exportPdfDocument,
  loadVersionSnapshots,
  loadVersionSnapshot,
  createVersionSnapshot,
  restoreVersion,
  versionHistoryLimit = 5,
  updateSummary,
  loadCurrentResume,
}: {
  resumeId: string;
  publicSlug?: string;
  initialDocument: ResumeEditorStoreState["document"];
  initialSummary?: string;
  initialVersion?: number;
  initialUpdatedAt?: number;
  autosaveDelayMs?: number;
  draftRepository?: ResumeDraftRepository;
  saveDocument?: (params: {
    resumeId: string;
    version: number;
    document: ResumeEditorStoreState["document"];
  }) => Promise<{ version: number; updatedAt: number }>;
  publishDocument?: (params: { resumeId: string }) => Promise<{ slug: string }>;
  unpublishDocument?: (params: { resumeId: string }) => Promise<void>;
  exportPdfDocument?: (params: { resumeId: string }) => Promise<void>;
  loadVersionSnapshots?: (
    resumeId: string,
    request: { page: number; pageSize: number },
  ) => Promise<PageResult<ResumeVersionSnapshotSummary>>;
  loadVersionSnapshot?: (params: {
    resumeId: string;
    snapshotId: string;
  }) => Promise<ResumeVersionSnapshotDetail>;
  createVersionSnapshot?: (resumeId: string) => Promise<ResumeVersionSnapshotSummary>;
  restoreVersion?: (params: {
    resumeId: string;
    snapshotId: string;
    version: number;
  }) => Promise<{
    document: ResumeEditorStoreState["document"];
    version: number;
    updatedAt: number;
  }>;
  versionHistoryLimit?: number;
  updateSummary?: (params: {
    resumeId: string;
    summary: string;
    version: number;
  }) => Promise<ResumeSummaryUpdateResult>;
  loadCurrentResume?: (resumeId: string) => Promise<{
    document: ResumeEditorStoreState["document"];
    version: number;
    updatedAt: number;
  }>;
}) {
  const { styles } = useResumeEditorShellStyles();
  const { locale, t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const [resolvedDraftRepository] = useState(
    () => draftRepository ?? createResumeDraftRepository(),
  );
  const [resolvedSaveDocument] = useState(
    () => saveDocument ?? saveResumeDocument,
  );
  const [resolvedUpdateSummary] = useState(
    () => updateSummary ?? updateResumeSummary,
  );
  const [resolvedPublishDocument] = useState(
    () => publishDocument ?? publishResume,
  );
  const [resolvedUnpublishDocument] = useState(
    () => unpublishDocument ?? unpublishResume,
  );
  const [resolvedExportPdfDocument] = useState(
    () => exportPdfDocument ?? exportResumePdfDocument,
  );
  const [resolvedLoadVersionSnapshots] = useState(
    () => loadVersionSnapshots ?? fetchResumeVersionSnapshots,
  );
  const [resolvedLoadVersionSnapshot] = useState(
    () => loadVersionSnapshot ?? fetchResumeVersionSnapshot,
  );
  const [resolvedCreateVersionSnapshot] = useState(
    () => createVersionSnapshot ?? createResumeVersionSnapshot,
  );
  const [resolvedRestoreVersion] = useState(
    () => restoreVersion ?? restoreResumeVersion,
  );
  const [resolvedLoadCurrentResume] = useState(
    () => loadCurrentResume ?? fetchCurrentResumeDocument,
  );
  const [store] = useState(() =>
    createResumeEditorStore({
      resumeId,
      document: initialDocument,
      version: initialVersion,
      updatedAt: initialUpdatedAt,
    }),
  );
  const [resumeSummary, setResumeSummary] = useState(initialSummary);
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  const flushSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;

      if (!store.getState().dirty) {
        return;
      }
    }

    const snapshot = store.getState();

    if (!snapshot.dirty) {
      return;
    }

    const savePromise = (async () => {
      store.getState().setSaveStatus("saving");

      try {
        const result = await resolvedSaveDocument({
          resumeId: snapshot.resumeId,
          version: snapshot.version,
          document: snapshot.document,
        });

        // A later edit can happen while this request is in flight. Only clear
        // dirty state when the saved snapshot is still the current document.
        store.getState().markSaved({
          ...result,
          document: snapshot.document,
        });

        if (!store.getState().dirty) {
          await resolvedDraftRepository.deleteDraft(snapshot.resumeId);
        }
      } catch (error) {
        if (error instanceof ResumeVersionConflictClientError) {
          store.getState().setSaveConflict({
            currentVersion: error.currentVersion,
          });
        } else if (error instanceof ResumeValidationClientError) {
          store.getState().setSaveValidation({
            issues: error.issues,
          });
        } else {
          store.getState().setSaveStatus("error");
        }

        throw new Error("save_failed");
      }
    })();

    saveInFlightRef.current = savePromise;

    try {
      await savePromise;
    } finally {
      if (saveInFlightRef.current === savePromise) {
        saveInFlightRef.current = null;
      }
    }
  }, [resolvedDraftRepository, resolvedSaveDocument, store]);

  const handleManualSave = useCallback(() => {
    void flushSave().catch(() => {
      // The persistence layer exposes failures through the existing editor state.
    });
  }, [flushSave]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((!event.metaKey && !event.ctrlKey) || event.defaultPrevented) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        handleManualSave();
        return;
      }

      if (isNativeEditableTarget(event.target)) {
        return;
      }

      if (key === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          store.getState().redo();
        } else {
          store.getState().undo();
        }

        return;
      }

      if (key === "y" && event.ctrlKey) {
        event.preventDefault();
        store.getState().redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleManualSave, store]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!store.getState().dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [store]);

  useResumePersistence({
    store,
    draftRepository: resolvedDraftRepository,
    saveDocument: resolvedSaveDocument,
    flushSave,
    debounceMs: autosaveDelayMs,
    initialUpdatedAt,
  });

  const document = useStore(store, (state) => state.document);
  const recoveryDraft = useStore(store, (state) => state.recoveryDraft);
  const saveConflict = useStore(store, (state) => state.saveConflict);
  const saveValidation = useStore(store, (state) => state.saveValidation);
  const selection = useStore(store, (state) => state.selection);
  const saveStatus = useStore(store, (state) => state.saveStatus);
  const dirty = useStore(store, (state) => state.dirty);
  const history = useStore(store, (state) => state.history);
  const zoom = useStore(store, (state) => state.zoom);
  const resumeName = useStore(store, (state) => state.document.meta.title);
  const textEditorRef = useRef<TiptapTextBlockEditorHandle>(null);
  const publicLinkCopiedTimerRef = useRef<number | undefined>(undefined);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const [textEditorFormattingState, setTextEditorFormattingState] = useState<{
    selectionKey: string;
    value: TiptapTextBlockEditorFormatState;
  }>({
    selectionKey: "",
    value: {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      tag: false,
      textColor: "",
      linkHref: "",
    },
  });
  const [selectedLinkUrlState, setSelectedLinkUrlState] = useState({
    selectionKey: "",
    value: "",
  });
  const [publishedSlug, setPublishedSlug] = useState(publicSlug);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editSurfaceMode, setEditSurfaceMode] = useState<EditSurfaceMode>("content");
  const [activeRibbonTab, setActiveRibbonTab] = useState<EditorRibbonTab>("home");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionSnapshots, setVersionSnapshots] = useState<ResumeVersionSnapshotSummary[]>([]);
  const [versionHistoryPage, setVersionHistoryPage] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [versionHistoryBusy, setVersionHistoryBusy] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState(false);
  const [versionDiffOpen, setVersionDiffOpen] = useState(false);
  const [versionDiffLoading, setVersionDiffLoading] = useState(false);
  const [versionDiffSnapshot, setVersionDiffSnapshot] =
    useState<ResumeVersionSnapshotDetail>();
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [showPrintSafeArea, setShowPrintSafeArea] = useState(false);
  const [conflictCloudResult, setConflictCloudResult] = useState<{
    requestedVersion: number;
    status: "ready" | "error";
    resume?: {
      document: ResumeEditorStoreState["document"];
      version: number;
      updatedAt: number;
    };
  }>();
  const [paginationRevision, setPaginationRevision] = useState(0);
  const [paginationReady, setPaginationReady] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const resolvedActivePage = Math.min(Math.max(activePage, 1), pageCount);
  const showSaveValidationNotification = useEffectEvent(() => {
    if (!saveValidation) return;

    notification.error({
      actions: (
        <Button
          size="small"
          onClick={() => store.getState().clearSaveValidation()}
        >
          {t("common.dismiss")}
        </Button>
      ),
      description:
        saveValidation.issues[0]?.message ?? t("editor.invalidPayload"),
      duration: false,
      key: "editor-save-validation",
      role: "alert",
      title: t("editor.validationTitle"),
    });
  });

  useEffect(() => {
    if (!saveValidation) {
      notification.destroy("editor-save-validation");
      return;
    }

    showSaveValidationNotification();
    return () => notification.destroy("editor-save-validation");
  }, [notification, saveValidation]);

  useEffect(() => {
    const key = "editor-autosave-error";
    if (saveStatus !== "error") {
      notification.destroy(key);
      return;
    }

    notification.error({
      duration: false,
      key,
      role: "alert",
      title: t("editor.saveError"),
    });
    return () => notification.destroy(key);
  }, [notification, saveStatus, t]);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(Boolean(globalThis.document.fullscreenElement));
    }

    syncFullscreenState();
    globalThis.document.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      globalThis.document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (!saveConflict) return;

    let cancelled = false;
    const requestedVersion = saveConflict.currentVersion;

    void resolvedLoadCurrentResume(resumeId)
      .then((resume) => {
        if (cancelled) return;
        setConflictCloudResult({
          requestedVersion,
          status: "ready",
          resume,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setConflictCloudResult({ requestedVersion, status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId, resolvedLoadCurrentResume, saveConflict]);

  const activeConflictCloudResult =
    saveConflict &&
    conflictCloudResult?.requestedVersion === saveConflict.currentVersion
      ? conflictCloudResult
      : undefined;
  const conflictCloudResume = activeConflictCloudResult?.resume;

  useEffect(
    () => () => {
      if (publicLinkCopiedTimerRef.current) {
        window.clearTimeout(publicLinkCopiedTimerRef.current);
      }
    },
    [],
  );

  const selectedSection = document.sections.find(
    (section) => section.id === selection.sectionId,
  );
  const selectedSectionTitle =
    selectedSection &&
    selection.richTextField === "title" &&
    !selection.blockPath?.length
      ? selectedSection.title
      : undefined;
  const selectedSectionIndex = selectedSection
    ? document.sections.findIndex((section) => section.id === selectedSection.id)
    : -1;
  const selectedTextBlock =
    selection.sectionId && selection.blockPath
      ? findTextBlock(document, selection.sectionId, selection.blockPath)
      : undefined;
  const selectedBlock =
    selection.sectionId && selection.blockPath
      ? findBlockByPath(
          selectedSection?.blocks ?? [],
          selection.blockPath,
        )
      : undefined;
  const selectedBadgeBlock =
    selectedBlock?.type === "badges" ? selectedBlock : undefined;
  const selectedStructuralBlock =
    selectedBlock && selectedBlock.type !== "text" ? selectedBlock : undefined;
  const selectedBadgeItem =
    selectedBadgeBlock?.type === "badges" && selection.badgeItemId
      ? selectedBadgeBlock.items.find((item) => item.id === selection.badgeItemId)
      : undefined;
  const selectedBadgeItemIndex =
    selectedBadgeBlock?.type === "badges" && selectedBadgeItem
      ? selectedBadgeBlock.items.findIndex(
          (item) => item.id === selectedBadgeItem.id,
        )
      : -1;
  const selectedRichTextContent =
    editSurfaceMode === "content"
      ? selectedSectionTitle ?? selectedTextBlock?.content
      : undefined;
  const textToolsDisabled = !selectedRichTextContent;
  const selectionKey = useMemo(
    () => {
      if (selection.sectionId && selection.richTextField === "title") {
        return `${selection.sectionId}:title`;
      }

      if (selection.sectionId && selection.blockPath) {
        return `${selection.sectionId}:${selection.blockPath.join("/")}`;
      }

      return "";
    },
    [selection.blockPath, selection.richTextField, selection.sectionId],
  );
  const selectedLinkUrl = getFirstLinkHref(selectedRichTextContent);
  const initialFormattingState = getInitialFormattingState(selectedRichTextContent);
  const resolvedFormattingState =
    selectionKey && selectionKey === textEditorFormattingState.selectionKey
      ? textEditorFormattingState.value
      : initialFormattingState;
  const resolvedLinkUrl =
    selectionKey && selectionKey === selectedLinkUrlState.selectionKey
      ? selectedLinkUrlState.value
      : resolvedFormattingState.linkHref || selectedLinkUrl;
  const matchingVisualPresetId = getMatchingResumeVisualPresetId(document);
  const fontPresets = listResumeFontPresets();
  const selectedBlockPosition =
    selection.sectionId && selection.blockPath
      ? getBlockSiblingPosition(document, selection.sectionId, selection.blockPath)
      : undefined;

  const handlePageCountChange = useCallback((nextPageCount: number) => {
    setPageCount((current) =>
      current === nextPageCount ? current : nextPageCount,
    );
  }, []);

  function runTextEditorCommand(command: TiptapTextBlockEditorCommand) {
    return textEditorRef.current?.applyCommand(command);
  }

  function updateSelectedTextBlockStyle(
    style: Parameters<ResumeEditorStoreState["updateTextBlockStyle"]>[0]["style"],
  ) {
    if (!selection.sectionId || !selection.blockPath) {
      return;
    }

    store.getState().updateTextBlockStyle({
      sectionId: selection.sectionId,
      blockPath: selection.blockPath,
      style,
    });
  }

  function setSelectedTextBlockColor(color: string) {
    if (!selection.sectionId || !selection.blockPath) {
      return;
    }

    store.getState().setTextBlockColor({
      sectionId: selection.sectionId,
      blockPath: selection.blockPath,
      color,
    });
  }

  function setSelectedSectionTitleColor(color?: string) {
    if (!selectedSection || !selectedSectionTitle) {
      return;
    }

    store.getState().setSectionTitleColor({
      sectionId: selectedSection.id,
      color,
    });
  }

  function setSelectedSectionTitleFontSize(fontSize?: number) {
    if (!selectedSection || !selectedSectionTitle) {
      return;
    }

    store.getState().setSectionTitleFontSize({
      sectionId: selectedSection.id,
      fontSize,
    });
  }

  function updateSelectedBadgeItems(items: BadgeBlock["items"]) {
    if (!selection.sectionId || !selection.blockPath) {
      return;
    }

    store.getState().updateBadgeItems({
      sectionId: selection.sectionId,
      blockPath: selection.blockPath,
      items,
    });
  }

  function updateSelectedBlockSettings(
    settings: Parameters<ResumeEditorStoreState["updateBlockSettings"]>[0]["settings"],
  ) {
    if (!selection.sectionId || !selection.blockPath) {
      return;
    }

    store.getState().updateBlockSettings({
      sectionId: selection.sectionId,
      blockPath: selection.blockPath,
      settings,
    });
  }

  function updateSelectedBlockGap(gap: number) {
    if (!selectedStructuralBlock) return;

    switch (selectedStructuralBlock.type) {
      case "list":
        updateSelectedBlockSettings({
          type: "list",
          ordered: selectedStructuralBlock.ordered,
          marker: selectedStructuralBlock.marker,
          gap,
        });
        break;
      case "badges":
        updateSelectedBlockSettings({
          type: "badges",
          wrap: selectedStructuralBlock.wrap,
          gap,
        });
        break;
      case "group":
        updateSelectedBlockSettings({
          type: "group",
          direction: selectedStructuralBlock.direction,
          align: selectedStructuralBlock.align,
          gap,
        });
        break;
      case "row":
        updateSelectedBlockSettings({
          type: "row",
          align: selectedStructuralBlock.align,
          justify: selectedStructuralBlock.justify,
          gap,
        });
        break;
    }
  }

  function updateSelectedSectionLayout(
    layout: Parameters<ResumeEditorStoreState["updateSectionLayout"]>[0]["layout"],
  ) {
    if (!selectedSection) {
      return;
    }

    store.getState().updateSectionLayout({
      sectionId: selectedSection.id,
      layout,
    });
  }

  function updateDocumentMeta(
    meta: Partial<ResumeEditorStoreState["document"]["meta"]>,
  ) {
    store.getState().updateDocument((current) => ({
      ...current,
      meta: {
        ...current.meta,
        ...meta,
      },
    }));
  }

  function updateDocumentTypography(
    typography: Partial<ResumeEditorStoreState["document"]["settings"]["typography"]>,
  ) {
    store.getState().updateDocument((current) => ({
      ...current,
      settings: {
        ...current.settings,
        typography: {
          ...current.settings.typography,
          ...typography,
        },
      },
    }));
  }

  function updateDocumentTheme(
    theme: Partial<ResumeEditorStoreState["document"]["settings"]["theme"]>,
  ) {
    store.getState().updateDocument((current) => ({
      ...current,
      settings: {
        ...current.settings,
        theme: {
          ...current.settings.theme,
          ...theme,
        },
      },
    }));
  }

  function updateDocumentPageMargin(
    margin: Partial<ResumeEditorStoreState["document"]["settings"]["page"]["margin"]>,
  ) {
    store.getState().updateDocument((current) => ({
      ...current,
      settings: {
        ...current.settings,
        page: {
          ...current.settings.page,
          margin: {
            ...current.settings.page.margin,
            ...margin,
          },
        },
      },
    }));
  }

  const canDeleteSelectedSection =
    Boolean(selectedSection) && document.sections.length > 1;
  const canMoveSelectedSectionUp = selectedSectionIndex > 0;
  const canMoveSelectedSectionDown =
    selectedSectionIndex > -1 && selectedSectionIndex < document.sections.length - 1;
  const canMoveSelectedBlockUp =
    Boolean(selectedBlock) && (selectedBlockPosition?.index ?? -1) > 0;
  const canMoveSelectedBlockDown =
    Boolean(selectedBlock) &&
    selectedBlockPosition !== undefined &&
    selectedBlockPosition.index < selectedBlockPosition.count - 1;
  const canDeleteSelectedBlock = Boolean(selectedBlock);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const canZoomOut = zoom > RESUME_EDITOR_ZOOM_MIN;
  const canZoomIn = zoom < RESUME_EDITOR_ZOOM_MAX;
  const previewHref = `/app/resumes/${resumeId}/preview`;
  const publicHref = publishedSlug ? `/resume/${publishedSlug}` : undefined;
  const quickInsertPresets = listSectionPresets(locale).filter(
    (preset) => preset.id !== "custom",
  );
  const editSurfaceModeLabel =
    editSurfaceMode === "layout"
      ? t("editor.layoutSorting")
      : t("editor.contentEditing");

  async function handlePublish() {
    setPublicationBusy(true);

    try {
      if (store.getState().dirty) {
        await flushSave();
      }

      const result = await resolvedPublishDocument({ resumeId });

      setPublishedSlug(result.slug);
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handleUnpublish() {
    setPublicationBusy(true);

    try {
      await resolvedUnpublishDocument({ resumeId });
      setPublishedSlug(undefined);
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handleExportPdf() {
    setPdfBusy(true);

    try {
      if (store.getState().dirty) {
        await flushSave();
      }

      await resolvedExportPdfDocument({ resumeId });
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleCopyPublicLink() {
    if (!publicHref) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        new URL(publicHref, window.location.origin).href,
      );
      setPublicLinkCopied(true);
      window.clearTimeout(publicLinkCopiedTimerRef.current);
      publicLinkCopiedTimerRef.current = window.setTimeout(() => {
        setPublicLinkCopied(false);
      }, 2_000);
    } catch {
      setPublicLinkCopied(false);
    }
  }

  async function loadVersionHistory(page: number) {
    const result = await resolvedLoadVersionSnapshots(resumeId, {
      page,
      pageSize: 20,
    });

    setVersionSnapshots(result.items);
    setVersionHistoryPage({
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  }

  async function handleOpenVersionHistory() {
    setVersionHistoryOpen(true);
    setVersionHistoryPage((current) => ({ ...current, page: 1 }));
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      await loadVersionHistory(1);
    } catch {
      setVersionHistoryError(true);
      toast.error({
        content: t("editor.versionHistoryError"),
        key: "editor-version-history-error",
      });
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  async function handleCreateVersionSnapshot() {
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      if (store.getState().dirty) {
        await flushSave();
      }

      await resolvedCreateVersionSnapshot(resumeId);
      await loadVersionHistory(1);
    } catch {
      setVersionHistoryError(true);
      toast.error({
        content: t("editor.versionHistoryError"),
        key: "editor-version-history-error",
      });
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  async function handleVersionHistoryPageChange(page: number) {
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      await loadVersionHistory(page);
    } catch {
      setVersionHistoryError(true);
      toast.error({
        content: t("editor.versionHistoryError"),
        key: "editor-version-history-error",
      });
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  async function handleOpenVersionDiff(snapshotId: string) {
    setVersionDiffOpen(true);
    setVersionDiffLoading(true);
    setVersionDiffSnapshot(undefined);

    try {
      const snapshot = await resolvedLoadVersionSnapshot({
        resumeId,
        snapshotId,
      });

      setVersionDiffSnapshot(snapshot);
    } catch {
      setVersionDiffOpen(false);
      toast.error({
        content: t("editor.diff.historyLoadError"),
        key: "editor-version-diff-error",
      });
    } finally {
      setVersionDiffLoading(false);
    }
  }

  async function handleRestoreVersion(snapshotId: string) {
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      if (store.getState().dirty) {
        await flushSave();
      }

      const restored = await resolvedRestoreVersion({
        resumeId,
        snapshotId,
        version: store.getState().version,
      });

      store.getState().restoreServerVersion(restored);
      await resolvedDraftRepository.deleteDraft(resumeId);
      setVersionHistoryOpen(false);
    } catch (error) {
      if (error instanceof ResumeVersionConflictClientError) {
        store.getState().setSaveConflict({
          currentVersion: error.currentVersion,
        });
      }

      setVersionHistoryError(true);
      toast.error({
        content: t("editor.versionHistoryError"),
        key: "editor-version-history-error",
      });
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  function handleEditSurfaceModeChange(nextMode: EditSurfaceMode) {
    setEditSurfaceMode(nextMode);

    if (nextMode !== "layout") {
      return;
    }

    if (selection.sectionId) {
      store.getState().setSelection({ sectionId: selection.sectionId });
      return;
    }

    store.getState().setSelection({});
  }

  function handleOutlineSectionSelection(sectionId: string) {
    const target = Array.from(
      canvasViewportRef.current?.querySelectorAll<HTMLElement>(
        "[data-resume-section-id]",
      ) ?? [],
    ).find(
      (element) => element.dataset.resumeSectionId === sectionId,
    );

    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    store.getState().setSelection({ sectionId });
  }

  function handleCanvasPageChange(nextPage: number) {
    const target = canvasViewportRef.current?.querySelector<HTMLElement>(
      `[data-resume-page-index="${nextPage}"]`,
    );

    target?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    setActivePage(nextPage);
  }

  async function handleToggleFullscreen() {
    try {
      if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen();
        return;
      }

      await globalThis.document.documentElement.requestFullscreen();
    } catch {
      setIsFullscreen(Boolean(globalThis.document.fullscreenElement));
    }
  }

  function handleCanvasViewportScroll() {
    const viewport = canvasViewportRef.current;

    if (!viewport) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const nextPage = getActiveResumePageIndex({
      pages: Array.from(
        viewport.querySelectorAll<HTMLElement>("[data-resume-page-index]"),
      ).map((page) => {
        const pageRect = page.getBoundingClientRect();

        return {
          index: Number(page.dataset.resumePageIndex),
          top: pageRect.top,
          height: pageRect.height,
        };
      }),
      viewport: {
        top: viewportRect.top,
        height: viewportRect.height,
      },
    });

    if (nextPage) {
      setActivePage((current) => (current === nextPage ? current : nextPage));
    }
  }

  const inspectorContent = selectedSectionTitle && selectedSection ? (
    <>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.sectionTitleStyle")}>
        <div className={styles.inspectorControlGrid}>
          <div className={styles.ribbonControlGroup}>
            <span className={styles.inspectorControlLabel}>
              {t("editor.sectionTitleColor")}
            </span>
            <PaletteColorPicker
              allowClear
              className={styles.ribbonColorControl}
              label={t("editor.sectionTitleColor")}
              paletteLabel={t("common.colorPalette")}
              value={selectedSection.titleStyle?.color ?? ""}
              placeholder={document.settings.theme.accent}
              onChange={setSelectedSectionTitleColor}
              onClear={() => setSelectedSectionTitleColor(undefined)}
            />
            <Button
              disabled={!selectedSection.titleStyle?.color}
              onClick={() => setSelectedSectionTitleColor(undefined)}
            >
              {t("editor.inheritGlobalAccent")}
            </Button>
          </div>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>
              {t("editor.sectionTitleFontSize")}
            </span>
            <DraftInput
              aria-label={t("editor.sectionTitleFontSize")}
              min={8}
              max={72}
              type="number"
              value={selectedSection.titleStyle?.fontSize?.toString() ?? ""}
              placeholder="24"
              parseValue={parsePositiveNumber}
              onValidValueChange={setSelectedSectionTitleFontSize}
            />
          </div>
          <Button
            disabled={!selectedSection.titleStyle?.fontSize}
            onClick={() => setSelectedSectionTitleFontSize(undefined)}
          >
            {t("editor.restoreDefaultTitleSize")}
          </Button>
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.sectionActions")}>
        <div className={styles.panelActionRow}>
        <Button
          onClick={() => {
            store.getState().setSectionTitle({ sectionId: selectedSection.id });
            store.getState().setSelection({ sectionId: selectedSection.id });
          }}
        >
          {t("editor.removeSectionTitle")}
        </Button>
        <Button
          disabled={!canMoveSelectedSectionUp}
          onClick={() =>
            store.getState().moveSection({
              sectionId: selectedSection.id,
              toIndex: selectedSectionIndex - 1,
            })
          }
        >
          {t("editor.moveUp")}
        </Button>
        <Button
          disabled={!canMoveSelectedSectionDown}
          onClick={() =>
            store.getState().moveSection({
              sectionId: selectedSection.id,
              toIndex: selectedSectionIndex + 1,
            })
          }
        >
          {t("editor.moveDown")}
        </Button>
        <Button
          onClick={() =>
            store.getState().setSectionVisibility({
              sectionId: selectedSection.id,
              visible: !selectedSection.visible,
            })
          }
        >
          {selectedSection.visible ? t("editor.hideSection") : t("editor.showSection")}
        </Button>
        <Button onClick={() => store.getState().duplicateSection(selectedSection.id)}>
          {t("editor.duplicateSection")}
        </Button>
        <Button
          danger
          disabled={!canDeleteSelectedSection}
          onClick={() => store.getState().deleteSection(selectedSection.id)}
        >
          {t("editor.deleteSection")}
        </Button>
        </div>
      </EditorRibbonPropertyGroup>
    </>
  ) : selectedTextBlock && selection.blockPath ? (
    <>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.textStyle")}>
        <div className={styles.inspectorControlGrid}>
          <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("editor.fontSize")}</span>
          <DraftInput
            aria-label={t("editor.fontSize")}
            type="number"
            value={selectedTextBlock.style?.fontSize?.toString() ?? ""}
            parseValue={parsePositiveNumber}
            onValidValueChange={(fontSize) =>
              updateSelectedTextBlockStyle({ fontSize })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("editor.fontWeight")}</span>
          <DraftInput
            aria-label={t("editor.fontWeight")}
            type="number"
            value={selectedTextBlock.style?.fontWeight?.toString() ?? ""}
            parseValue={parsePositiveNumber}
            onValidValueChange={(fontWeight) =>
              updateSelectedTextBlockStyle({ fontWeight })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("editor.lineHeight")}</span>
          <DraftInput
            aria-label={t("editor.lineHeight")}
            inputMode="decimal"
            value={selectedTextBlock.style?.lineHeight?.toString() ?? ""}
            parseValue={parseCommittedPositiveDecimal}
            onValidValueChange={(lineHeight) =>
              updateSelectedTextBlockStyle({ lineHeight })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="color">
          <span className={styles.inspectorControlLabel}>{t("editor.textColor")}</span>
          <PaletteColorPicker
            className={styles.colorControl}
            label={t("editor.textColor")}
            paletteLabel={t("common.colorPalette")}
            value={selectedTextBlock.style?.color ?? ""}
            placeholder="#0f172a"
            onChange={setSelectedTextBlockColor}
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="auto">
          <span className={styles.inspectorControlLabel}>{t("editor.align")}</span>
          <div className={styles.alignButtonRow}>
            <Button
              type={selectedTextBlock.style?.align === "left" ? "primary" : "default"}
              onClick={() => updateSelectedTextBlockStyle({ align: "left" })}
            >
              {t("editor.alignLeft")}
            </Button>
            <Button
              type={selectedTextBlock.style?.align === "center" ? "primary" : "default"}
              onClick={() => updateSelectedTextBlockStyle({ align: "center" })}
            >
              {t("editor.alignCenter")}
            </Button>
            <Button
              type={selectedTextBlock.style?.align === "right" ? "primary" : "default"}
              onClick={() => updateSelectedTextBlockStyle({ align: "right" })}
            >
              {t("editor.alignRight")}
            </Button>
          </div>
          </div>
        </div>
      </EditorRibbonPropertyGroup>
      {selectedSection ? (
        <EditorRibbonPropertyGroup label={t("editor.ribbon.property.contentActions")}>
          <div className={styles.panelActionRow}>
            <Button
            disabled={!canMoveSelectedBlockUp}
            onClick={() =>
              selection.sectionId && selection.blockPath && selectedBlockPosition
                ? store.getState().moveBlock({
                    sectionId: selection.sectionId,
                    blockPath: selection.blockPath,
                    toIndex: selectedBlockPosition.index - 1,
                  })
                : undefined
            }
          >
            {t("editor.moveBlockUp")}
          </Button>
          <Button
            disabled={!canMoveSelectedBlockDown}
            onClick={() =>
              selection.sectionId && selection.blockPath && selectedBlockPosition
                ? store.getState().moveBlock({
                    sectionId: selection.sectionId,
                    blockPath: selection.blockPath,
                    toIndex: selectedBlockPosition.index + 1,
                  })
                : undefined
            }
          >
            {t("editor.moveBlockDown")}
          </Button>
          <Button
            onClick={() =>
              selection.sectionId && selection.blockPath
                ? store.getState().duplicateBlock({
                    sectionId: selection.sectionId,
                    blockPath: selection.blockPath,
                  })
                : undefined
            }
          >
            {t("editor.duplicateBlock")}
          </Button>
          <Button
            danger
            disabled={!canDeleteSelectedBlock}
            onClick={() =>
              selection.sectionId && selection.blockPath
                ? store.getState().deleteBlock({
                    sectionId: selection.sectionId,
                    blockPath: selection.blockPath,
                  })
                : undefined
            }
          >
            {t("editor.deleteBlock")}
          </Button>
          <Button
            disabled={!canMoveSelectedSectionUp}
            onClick={() =>
              store.getState().moveSection({
                sectionId: selectedSection.id,
                toIndex: selectedSectionIndex - 1,
              })
            }
          >
            {t("editor.moveUp")}
          </Button>
          <Button
            disabled={!canMoveSelectedSectionDown}
            onClick={() =>
              store.getState().moveSection({
                sectionId: selectedSection.id,
                toIndex: selectedSectionIndex + 1,
              })
            }
          >
            {t("editor.moveDown")}
          </Button>
          <Button
            onClick={() =>
              store.getState().setSectionVisibility({
                sectionId: selectedSection.id,
                visible: !selectedSection.visible,
              })
            }
          >
            {selectedSection.visible ? t("editor.hideSection") : t("editor.showSection")}
          </Button>
          <Button onClick={() => store.getState().duplicateSection(selectedSection.id)}>
            {t("editor.duplicateSection")}
          </Button>
          <Button
            danger
            disabled={!canDeleteSelectedSection}
            onClick={() => store.getState().deleteSection(selectedSection.id)}
          >
            {t("editor.deleteSection")}
            </Button>
          </div>
        </EditorRibbonPropertyGroup>
      ) : null}
    </>
  ) : selectedBadgeBlock?.type === "badges" && selectedBadgeItem && selection.blockPath ? (
    <>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.badgeContent")}>
        <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow} data-field-size="medium">
          <span className={styles.inspectorControlLabel}>{t("editor.badgeText")}</span>
          <DraftInput
            aria-label={t("editor.badgeText")}
            value={selectedBadgeItem.text}
            parseValue={(text) => (text.trim() ? text : undefined)}
            onValidValueChange={(text) =>
              updateSelectedBadgeItems(
                selectedBadgeBlock.items.map((item) =>
                  item.id === selectedBadgeItem.id ? { ...item, text } : item,
                ),
              )
            }
          />
        </div>
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.badgeActions")}>
        <div className={styles.panelActionRow}>
        <Button
          onClick={() => {
            const newBadge = {
              id: `badge-${crypto.randomUUID()}`,
              text: t("editor.newBadge"),
            };
            const insertAt = selectedBadgeItemIndex + 1;

            updateSelectedBadgeItems([
              ...selectedBadgeBlock.items.slice(0, insertAt),
              newBadge,
              ...selectedBadgeBlock.items.slice(insertAt),
            ]);
            store.getState().setSelection({
              sectionId: selection.sectionId,
              blockPath: selection.blockPath,
              badgeItemId: newBadge.id,
            });
          }}
        >
          {t("editor.addBadge")}
        </Button>
        <Button
          danger
          onClick={() => {
            if (!selection.sectionId || !selection.blockPath) {
              return;
            }

            if (selectedBadgeBlock.items.length === 1) {
              store.getState().deleteBlock({
                sectionId: selection.sectionId,
                blockPath: selection.blockPath,
              });
              return;
            }

            const nextItems = selectedBadgeBlock.items.filter(
              (item) => item.id !== selectedBadgeItem.id,
            );
            const fallbackItem =
              nextItems[selectedBadgeItemIndex] ??
              nextItems[selectedBadgeItemIndex - 1];

            updateSelectedBadgeItems(nextItems);
            store.getState().setSelection(
              fallbackItem
                ? {
                    sectionId: selection.sectionId,
                    blockPath: selection.blockPath,
                    badgeItemId: fallbackItem.id,
                  }
                : { sectionId: selection.sectionId },
            );
          }}
        >
          {t("editor.deleteBadge")}
        </Button>
        </div>
      </EditorRibbonPropertyGroup>
    </>
  ) : selectedStructuralBlock && selection.sectionId && selection.blockPath ? (
    <>
      <EditorRibbonPropertyGroup
        label={t(`editor.ribbon.property.${selectedStructuralBlock.type}Layout`)}
      >
        <div className={styles.inspectorControlGrid}>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>{t("editor.contentGap")}</span>
            <DraftInput
              aria-label={t("editor.contentGap")}
              min={0}
              type="number"
              value={selectedStructuralBlock.gap?.toString() ?? ""}
              parseValue={parseNonNegativeNumber}
              onValidValueChange={updateSelectedBlockGap}
            />
          </div>
          {selectedStructuralBlock.type === "list" ? (
            <>
              <div className={styles.inspectorControlRow} data-field-size="auto">
                <span className={styles.inspectorControlLabel}>{t("editor.orderedList")}</span>
                <Switch
                  aria-label={t("editor.orderedList")}
                  checked={selectedStructuralBlock.ordered ?? false}
                  onChange={(ordered) =>
                    updateSelectedBlockSettings({
                      type: "list",
                      ordered,
                      marker: selectedStructuralBlock.marker,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
              <div className={styles.inspectorControlRow} data-field-size="select-compact">
                <span className={styles.inspectorControlLabel}>{t("editor.listMarker")}</span>
                <Select
                  aria-label={t("editor.listMarker")}
                  value={selectedStructuralBlock.marker ?? "disc"}
                  options={[
                    { value: "disc", label: t("editor.listMarker.disc") },
                    { value: "square", label: t("editor.listMarker.square") },
                    { value: "dash", label: t("editor.listMarker.dash") },
                    { value: "none", label: t("editor.listMarker.none") },
                  ]}
                  onChange={(marker) =>
                    updateSelectedBlockSettings({
                      type: "list",
                      ordered: selectedStructuralBlock.ordered,
                      marker,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
            </>
          ) : null}
          {selectedStructuralBlock.type === "badges" ? (
            <div className={styles.inspectorControlRow} data-field-size="auto">
              <span className={styles.inspectorControlLabel}>{t("editor.wrapBadges")}</span>
              <Switch
                aria-label={t("editor.wrapBadges")}
                checked={selectedStructuralBlock.wrap}
                onChange={(wrap) =>
                  updateSelectedBlockSettings({
                    type: "badges",
                    wrap,
                    gap: selectedStructuralBlock.gap,
                  })
                }
              />
            </div>
          ) : null}
          {selectedStructuralBlock.type === "group" ? (
            <>
              <div className={styles.inspectorControlRow} data-field-size="select-compact">
                <span className={styles.inspectorControlLabel}>{t("editor.layoutDirection")}</span>
                <Select
                  aria-label={t("editor.layoutDirection")}
                  value={selectedStructuralBlock.direction}
                  options={[
                    { value: "vertical", label: t("editor.verticalLayout") },
                    { value: "horizontal", label: t("editor.horizontalLayout") },
                  ]}
                  onChange={(direction) =>
                    updateSelectedBlockSettings({
                      type: "group",
                      direction,
                      align: selectedStructuralBlock.align,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
              <div className={styles.inspectorControlRow} data-field-size="select-compact">
                <span className={styles.inspectorControlLabel}>{t("editor.crossAxisAlign")}</span>
                <Select
                  aria-label={t("editor.crossAxisAlign")}
                  value={selectedStructuralBlock.align ?? "stretch"}
                  options={[
                    { value: "start", label: t("editor.align.start") },
                    { value: "center", label: t("editor.align.center") },
                    { value: "end", label: t("editor.align.end") },
                    { value: "stretch", label: t("editor.align.stretch") },
                  ]}
                  onChange={(align) =>
                    updateSelectedBlockSettings({
                      type: "group",
                      direction: selectedStructuralBlock.direction,
                      align,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
            </>
          ) : null}
          {selectedStructuralBlock.type === "row" ? (
            <>
              <div className={styles.inspectorControlRow} data-field-size="select-compact">
                <span className={styles.inspectorControlLabel}>{t("editor.verticalAlign")}</span>
                <Select
                  aria-label={t("editor.verticalAlign")}
                  value={selectedStructuralBlock.align ?? "start"}
                  options={[
                    { value: "start", label: t("editor.align.start") },
                    { value: "center", label: t("editor.align.center") },
                    { value: "end", label: t("editor.align.end") },
                  ]}
                  onChange={(align) =>
                    updateSelectedBlockSettings({
                      type: "row",
                      align,
                      justify: selectedStructuralBlock.justify,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
              <div className={styles.inspectorControlRow} data-field-size="select-compact">
                <span className={styles.inspectorControlLabel}>{t("editor.horizontalJustify")}</span>
                <Select
                  aria-label={t("editor.horizontalJustify")}
                  value={selectedStructuralBlock.justify ?? "start"}
                  options={[
                    { value: "start", label: t("editor.justify.start") },
                    { value: "between", label: t("editor.justify.between") },
                    { value: "end", label: t("editor.justify.end") },
                  ]}
                  onChange={(justify) =>
                    updateSelectedBlockSettings({
                      type: "row",
                      align: selectedStructuralBlock.align,
                      justify,
                      gap: selectedStructuralBlock.gap,
                    })
                  }
                />
              </div>
            </>
          ) : null}
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.contentActions")}>
        <div className={styles.panelActionRow}>
          <Button
            disabled={!canMoveSelectedBlockUp}
            onClick={() =>
              selectedBlockPosition
                ? store.getState().moveBlock({
                    sectionId: selection.sectionId!,
                    blockPath: selection.blockPath!,
                    toIndex: selectedBlockPosition.index - 1,
                  })
                : undefined
            }
          >
            {t("editor.moveBlockUp")}
          </Button>
          <Button
            disabled={!canMoveSelectedBlockDown}
            onClick={() =>
              selectedBlockPosition
                ? store.getState().moveBlock({
                    sectionId: selection.sectionId!,
                    blockPath: selection.blockPath!,
                    toIndex: selectedBlockPosition.index + 1,
                  })
                : undefined
            }
          >
            {t("editor.moveBlockDown")}
          </Button>
          <Button
            onClick={() =>
              store.getState().duplicateBlock({
                sectionId: selection.sectionId!,
                blockPath: selection.blockPath!,
              })
            }
          >
            {t("editor.duplicateBlock")}
          </Button>
          <Button
            danger
            disabled={!canDeleteSelectedBlock}
            onClick={() =>
              store.getState().deleteBlock({
                sectionId: selection.sectionId!,
                blockPath: selection.blockPath!,
              })
            }
          >
            {t("editor.deleteBlock")}
          </Button>
        </div>
      </EditorRibbonPropertyGroup>
    </>
  ) : selectedSection ? (
    <>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.sectionLayout")}>
        <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.sectionColumns")}</span>
          <DraftInput
            aria-label={t("common.sectionColumns")}
            type="number"
            value={selectedSection.layout?.columns?.toString() ?? ""}
            parseValue={parsePositiveInteger}
            onValidValueChange={(columns) =>
              updateSelectedSectionLayout({ columns })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.sectionGap")}</span>
          <DraftInput
            aria-label={t("common.sectionGap")}
            type="number"
            value={selectedSection.layout?.gap?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(gap) => updateSelectedSectionLayout({ gap })}
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="auto">
          <span className={styles.inspectorControlLabel}>{t("editor.layoutDirection")}</span>
          <div className={styles.alignButtonRow}>
            <Button
              type={
                (selectedSection.layout?.direction ?? "vertical") === "vertical"
                  ? "primary"
                  : "default"
              }
              onClick={() => updateSelectedSectionLayout({ direction: "vertical" })}
            >
              {t("editor.verticalLayout")}
            </Button>
            <Button
              type={
                selectedSection.layout?.direction === "horizontal"
                  ? "primary"
                  : "default"
              }
              onClick={() => updateSelectedSectionLayout({ direction: "horizontal" })}
            >
              {t("editor.horizontalLayout")}
            </Button>
          </div>
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.paddingTop")}</span>
          <DraftInput
            aria-label={t("common.paddingTop")}
            type="number"
            value={selectedSection.layout?.padding?.top?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(top) =>
              updateSelectedSectionLayout({
                padding: {
                  top,
                  right: selectedSection.layout?.padding?.right ?? 0,
                  bottom: selectedSection.layout?.padding?.bottom ?? 0,
                  left: selectedSection.layout?.padding?.left ?? 0,
                },
              })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.paddingRight")}</span>
          <DraftInput
            aria-label={t("common.paddingRight")}
            type="number"
            value={selectedSection.layout?.padding?.right?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(right) =>
              updateSelectedSectionLayout({
                padding: {
                  top: selectedSection.layout?.padding?.top ?? 0,
                  right,
                  bottom: selectedSection.layout?.padding?.bottom ?? 0,
                  left: selectedSection.layout?.padding?.left ?? 0,
                },
              })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.paddingBottom")}</span>
          <DraftInput
            aria-label={t("common.paddingBottom")}
            type="number"
            value={selectedSection.layout?.padding?.bottom?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(bottom) =>
              updateSelectedSectionLayout({
                padding: {
                  top: selectedSection.layout?.padding?.top ?? 0,
                  right: selectedSection.layout?.padding?.right ?? 0,
                  bottom,
                  left: selectedSection.layout?.padding?.left ?? 0,
                },
              })
            }
          />
        </div>
        <div className={styles.inspectorControlRow} data-field-size="compact">
          <span className={styles.inspectorControlLabel}>{t("common.paddingLeft")}</span>
          <DraftInput
            aria-label={t("common.paddingLeft")}
            type="number"
            value={selectedSection.layout?.padding?.left?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(left) =>
              updateSelectedSectionLayout({
                padding: {
                  top: selectedSection.layout?.padding?.top ?? 0,
                  right: selectedSection.layout?.padding?.right ?? 0,
                  bottom: selectedSection.layout?.padding?.bottom ?? 0,
                  left,
                },
              })
            }
          />
        </div>
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.sectionBehavior")}>
        <div className={styles.inspectorControlGrid}>
          <div className={styles.inspectorControlRow} data-field-size="auto">
            <span className={styles.inspectorControlLabel}>{t("editor.keepSectionTogether")}</span>
            <Checkbox
              aria-label={t("editor.keepSectionTogether")}
              checked={selectedSection.pagination?.keepTogether ?? false}
              onChange={(event) =>
                store.getState().updateSectionPagination({
                  sectionId: selectedSection.id,
                  pagination: { keepTogether: event.target.checked },
                })
              }
            />
          </div>
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.sectionActions")}>
        <div className={styles.panelActionRow}>
        {!selectedSection.title ? (
          <Button
            onClick={() => {
              store.getState().setSectionTitle({
                sectionId: selectedSection.id,
                title: createRichTextFromPlainText(t("editor.sectionTitle")),
              });
              store.getState().setSelection({
                sectionId: selectedSection.id,
                richTextField: "title",
              });
            }}
          >
            {t("editor.addSectionTitle")}
          </Button>
        ) : (
          <Button
            onClick={() =>
              store.getState().setSectionTitle({ sectionId: selectedSection.id })
            }
          >
            {t("editor.removeSectionTitle")}
          </Button>
        )}
        <Button
          disabled={!canMoveSelectedSectionUp}
          onClick={() =>
            store.getState().moveSection({
              sectionId: selectedSection.id,
              toIndex: selectedSectionIndex - 1,
            })
          }
        >
          {t("editor.moveUp")}
        </Button>
        <Button
          disabled={!canMoveSelectedSectionDown}
          onClick={() =>
            store.getState().moveSection({
              sectionId: selectedSection.id,
              toIndex: selectedSectionIndex + 1,
            })
          }
        >
          {t("editor.moveDown")}
        </Button>
        <Button
          onClick={() =>
            store.getState().setSectionVisibility({
              sectionId: selectedSection.id,
              visible: !selectedSection.visible,
            })
          }
        >
          {selectedSection.visible ? t("editor.hideSection") : t("editor.showSection")}
        </Button>
        <Button onClick={() => store.getState().duplicateSection(selectedSection.id)}>
          {t("editor.duplicateSection")}
        </Button>
        <Button
          danger
          disabled={!canDeleteSelectedSection}
          onClick={() => store.getState().deleteSection(selectedSection.id)}
        >
          {t("editor.deleteSection")}
        </Button>
        </div>
      </EditorRibbonPropertyGroup>
    </>
  ) : (
    <>
      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.basic")}>
        <div className={styles.documentPropertyPair}>
          <div
            className={styles.inspectorControlRow}
            data-field-size="select-medium"
          >
            <div className={styles.inspectorLabelWithHint}>
              <span className={styles.inspectorControlLabel}>{t("common.locale")}</span>
              <Tooltip title={t("editor.templateLanguageHelp")}>
                <button
                  type="button"
                  aria-label={t("editor.templateLanguageHelpLabel")}
                  className={styles.inspectorHelpButton}
                >
                  <HelpIcon size={15} />
                </button>
              </Tooltip>
            </div>
            <Select
              data-testid="document-template-language-select"
              aria-label={t("common.locale")}
              value={document.meta.locale === "en-US" ? "en-US" : "zh-CN"}
              options={[
                { value: "zh-CN", label: t("common.languageOption.zh-CN") },
                { value: "en-US", label: t("common.languageOption.en-US") },
              ]}
              onChange={(locale) => updateDocumentMeta({ locale })}
            />
          </div>
          <div
            className={styles.inspectorControlRow}
            data-field-size="select-medium"
          >
            <span className={styles.inspectorControlLabel}>{t("editor.visualPreset")}</span>
            <Select
              data-testid="document-visual-preset-select"
              aria-label={t("editor.visualPreset")}
              value={matchingVisualPresetId ?? "custom"}
              options={[
                ...listResumeVisualPresets().map((preset) => ({
                  value: preset.id,
                  label: getVisualPresetLabel(preset.id, t),
                })),
                {
                  value: "custom",
                  label: getVisualPresetLabel("custom", t),
                  disabled: true,
                },
              ]}
              onChange={(presetId: ResumeVisualPresetId | "custom") => {
                if (presetId === "custom") return;

                store.getState().updateDocument((current) =>
                  applyResumeVisualPreset(current, presetId),
                );
              }}
            />
          </div>
        </div>
      </EditorRibbonPropertyGroup>

      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.typography")}>
        <div className={styles.documentPropertyStack}>
          <div
            className={styles.inspectorControlRow}
            data-field-size="select-wide"
          >
            <span className={styles.inspectorControlLabel}>{t("common.fontFamily")}</span>
            <Select
              data-testid="document-font-family-select"
              aria-label={t("common.fontFamily")}
              showSearch
              popupMatchSelectWidth={360}
              filterOption={(input, option) => {
                const value = typeof option?.value === "string" ? option.value : "";
                const matchingPreset = fontPresets.find(
                  (preset) => preset.fontFamily === value,
                );

                if (!matchingPreset) {
                  return value.toLocaleLowerCase().includes(
                    input.trim().toLocaleLowerCase(),
                  );
                }

                return filterResumeFontPresets(input, {
                  getDescription: (preset) => t(preset.descriptionKey),
                }).some((preset) => preset.id === matchingPreset.id);
              }}
              value={document.settings.typography.fontFamily}
              labelRender={({ value }) =>
                fontPresets.find((preset) => preset.fontFamily === value)?.name ??
                t("editor.fontPreset.custom")
              }
              options={[
                ...fontPresets.map((preset) => ({
                  value: preset.fontFamily,
                  label: (
                    <span
                      className={styles.fontPresetOption}
                      style={{ fontFamily: preset.resolvedFontFamily }}
                    >
                      <span className={styles.fontPresetName} title={preset.name}>
                        {preset.name}
                      </span>
                      <span
                        className={styles.fontPresetMeta}
                        title={`${t(preset.descriptionKey)} · ${t("editor.fontPreset.license")}`}
                      >
                        {t(preset.descriptionKey)} · {t("editor.fontPreset.license")}
                      </span>
                    </span>
                  ),
                })),
                ...(
                  fontPresets.some(
                    (preset) =>
                      preset.fontFamily === document.settings.typography.fontFamily,
                  )
                    ? []
                    : [
                        {
                          value: document.settings.typography.fontFamily,
                          label: t("editor.fontPreset.custom"),
                          disabled: true,
                        },
                      ]
                ),
              ]}
              onChange={(fontFamily) => updateDocumentTypography({ fontFamily })}
            />
          </div>
          <div className={styles.documentPropertyPair}>
            <div className={styles.inspectorControlRow} data-field-size="compact">
              <span className={styles.inspectorControlLabel}>{t("common.baseFontSize")}</span>
              <DraftInput
                aria-label={t("common.baseFontSize")}
                type="number"
                value={document.settings.typography.baseFontSize.toString()}
                parseValue={parsePositiveNumber}
                onValidValueChange={(baseFontSize) =>
                  updateDocumentTypography({ baseFontSize })
                }
              />
            </div>
            <div className={styles.inspectorControlRow} data-field-size="compact">
              <span className={styles.inspectorControlLabel}>{t("common.baseLineHeight")}</span>
              <DraftInput
                aria-label={t("common.baseLineHeight")}
                inputMode="decimal"
                value={document.settings.typography.lineHeight.toString()}
                parseValue={parseCommittedPositiveDecimal}
                onValidValueChange={(lineHeight) =>
                  updateDocumentTypography({ lineHeight })
                }
              />
            </div>
          </div>
        </div>
      </EditorRibbonPropertyGroup>

      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.colors")}>
        <div
          className={styles.documentColorStack}
          data-testid="document-theme-colors"
        >
          <div className={styles.inspectorControlRow} data-field-size="color">
            <span className={styles.inspectorControlLabel}>{t("editor.accentTone")}</span>
            <PaletteColorPicker
              className={styles.colorControl}
              label={t("common.accentColor")}
              paletteLabel={t("common.colorPalette")}
              value={document.settings.theme.accent}
              placeholder="#0f62fe"
              onChange={(accent) => updateDocumentTheme({ accent })}
            />
          </div>
          <div className={styles.documentPropertyPair}>
            <div className={styles.inspectorControlRow} data-field-size="color">
              <span className={styles.inspectorControlLabel}>{t("editor.textTone")}</span>
              <PaletteColorPicker
                className={styles.colorControl}
                label={t("common.textThemeColor")}
                paletteLabel={t("common.colorPalette")}
                value={document.settings.theme.textColor}
                placeholder="#0f172a"
                onChange={(textColor) => updateDocumentTheme({ textColor })}
              />
            </div>
            <div className={styles.inspectorControlRow} data-field-size="color">
              <span className={styles.inspectorControlLabel}>{t("editor.mutedTone")}</span>
              <PaletteColorPicker
                className={styles.colorControl}
                label={t("common.mutedThemeColor")}
                paletteLabel={t("common.colorPalette")}
                value={document.settings.theme.mutedColor}
                placeholder="#475569"
                onChange={(mutedColor) => updateDocumentTheme({ mutedColor })}
              />
            </div>
          </div>
        </div>
      </EditorRibbonPropertyGroup>

      <EditorRibbonPropertyGroup label={t("editor.ribbon.property.margins")}>
        <div className={styles.documentMarginGrid}>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>{t("common.pageMarginTop")}</span>
            <DraftInput
              aria-label={t("common.pageMarginTop")}
              type="number"
              value={document.settings.page.margin.top.toString()}
              parseValue={parseNonNegativeNumber}
              onValidValueChange={(top) => updateDocumentPageMargin({ top })}
            />
          </div>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>{t("common.pageMarginBottom")}</span>
            <DraftInput
              aria-label={t("common.pageMarginBottom")}
              type="number"
              value={document.settings.page.margin.bottom.toString()}
              parseValue={parseNonNegativeNumber}
              onValidValueChange={(bottom) => updateDocumentPageMargin({ bottom })}
            />
          </div>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>{t("common.pageMarginRight")}</span>
            <DraftInput
              aria-label={t("common.pageMarginRight")}
              type="number"
              value={document.settings.page.margin.right.toString()}
              parseValue={parseNonNegativeNumber}
              onValidValueChange={(right) => updateDocumentPageMargin({ right })}
            />
          </div>
          <div className={styles.inspectorControlRow} data-field-size="compact">
            <span className={styles.inspectorControlLabel}>{t("common.pageMarginLeft")}</span>
            <DraftInput
              aria-label={t("common.pageMarginLeft")}
              type="number"
              value={document.settings.page.margin.left.toString()}
              parseValue={parseNonNegativeNumber}
              onValidValueChange={(left) => updateDocumentPageMargin({ left })}
            />
          </div>
        </div>
      </EditorRibbonPropertyGroup>
    </>
  );

  const ribbonTabs: EditorRibbonTabItem[] = [
    {
      key: "home",
      label: t("editor.ribbon.tab.home"),
      icon: <HomeIcon size={15} />,
    },
    {
      key: "insert",
      label: t("editor.ribbon.tab.insert"),
      icon: <InsertIcon size={15} />,
    },
    {
      key: "layout",
      label: t("editor.ribbon.tab.layout"),
      icon: <LayoutIcon size={15} />,
    },
    {
      key: "document",
      label: t("editor.ribbon.tab.document"),
      icon: <DocumentIcon size={15} />,
    },
    {
      key: "properties",
      label: t("editor.ribbon.tab.properties"),
      icon: <PropertiesIcon size={15} />,
    },
  ];

  const quickActions = (
    <>
      <Button
        aria-label={t("editor.undo")}
        className={styles.ribbonIconButton}
        disabled={!canUndo}
        title={t("editor.undoShortcut")}
        type="text"
        onClick={() => store.getState().undo()}
      >
        <UndoIcon size={16} />
      </Button>
      <Button
        aria-label={t("editor.redo")}
        className={styles.ribbonIconButton}
        disabled={!canRedo}
        title={t("editor.redoShortcut")}
        type="text"
        onClick={() => store.getState().redo()}
      >
        <RedoIcon size={16} />
      </Button>
    </>
  );

  const documentActions = (
    <>
      <Tooltip
        title={isFullscreen ? t("editor.exitFullscreen") : t("editor.enterFullscreen")}
      >
        <Button
          aria-label={
            isFullscreen ? t("editor.exitFullscreen") : t("editor.enterFullscreen")
          }
          className={styles.ribbonIconButton}
          type="text"
          onClick={() => void handleToggleFullscreen()}
        >
          {isFullscreen ? (
            <ExitFullscreenIcon size={16} />
          ) : (
            <EnterFullscreenIcon size={16} />
          )}
        </Button>
      </Tooltip>
      <Button
        disabled={!dirty || saveStatus === "saving"}
        loading={saveStatus === "saving"}
        title={t("editor.saveShortcut")}
        onClick={handleManualSave}
      >
        {t("editor.save")}
      </Button>
      <Button href={previewHref}>
        {t("common.preview")}
      </Button>
      <Button
        disabled={pdfBusy}
        loading={pdfBusy}
        type="primary"
        onClick={() => void handleExportPdf()}
      >
        {t("common.pdf")}
      </Button>
    </>
  );

  const ribbonCommandGroups: EditorRibbonGroup[] = (() => {
    switch (activeRibbonTab) {
      case "home":
        return [
          {
            key: "mode",
            label: t("editor.ribbon.group.mode"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Button
                  aria-pressed={editSurfaceMode === "content"}
                  type={editSurfaceMode === "content" ? "primary" : "default"}
                  onClick={() => handleEditSurfaceModeChange("content")}
                >
                  {t("editor.contentEditing")}
                </Button>
                <Button
                  aria-pressed={editSurfaceMode === "layout"}
                  type={editSurfaceMode === "layout" ? "primary" : "default"}
                  onClick={() => handleEditSurfaceModeChange("layout")}
                >
                  {t("editor.layoutSorting")}
                </Button>
              </div>
            ),
          },
          {
            key: "text",
            label: t("editor.ribbon.group.text"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Button
                  disabled={textToolsDisabled}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => setIconPickerOpen(true)}
                >
                  {t("editor.iconLibrary.open")}
                </Button>
                <Button
                  aria-pressed={resolvedFormattingState.bold}
                  disabled={textToolsDisabled}
                  type={resolvedFormattingState.bold ? "primary" : "default"}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => runTextEditorCommand({ type: "toggleBold" })}
                >
                  {t("editor.bold")}
                </Button>
                <Button
                  aria-pressed={resolvedFormattingState.italic}
                  disabled={textToolsDisabled}
                  type={resolvedFormattingState.italic ? "primary" : "default"}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => runTextEditorCommand({ type: "toggleItalic" })}
                >
                  {t("editor.italic")}
                </Button>
                <Button
                  aria-pressed={resolvedFormattingState.underline}
                  disabled={textToolsDisabled}
                  type={resolvedFormattingState.underline ? "primary" : "default"}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => runTextEditorCommand({ type: "toggleUnderline" })}
                >
                  {t("editor.underline")}
                </Button>
                <Button
                  aria-pressed={resolvedFormattingState.strike}
                  disabled={textToolsDisabled}
                  type={resolvedFormattingState.strike ? "primary" : "default"}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => runTextEditorCommand({ type: "toggleStrike" })}
                >
                  {t("editor.strike")}
                </Button>
                <Button
                  aria-pressed={resolvedFormattingState.tag}
                  disabled={textToolsDisabled}
                  type={resolvedFormattingState.tag ? "primary" : "default"}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => runTextEditorCommand({ type: "toggleTag" })}
                >
                  {t("editor.inlineTag")}
                </Button>
                <PaletteColorPicker
                  allowClear={Boolean(selectedSectionTitle)}
                  className={styles.ribbonColorControl}
                  disabled={!selectedTextBlock && !selectedSectionTitle}
                  label={
                    selectedSectionTitle
                      ? t("editor.sectionTitleColor")
                      : t("editor.textColor")
                  }
                  paletteLabel={t("common.colorPalette")}
                  value={
                    selectedSectionTitle
                      ? selectedSection?.titleStyle?.color ?? ""
                      : selectedTextBlock?.style?.color ?? ""
                  }
                  placeholder={
                    selectedSectionTitle
                      ? document.settings.theme.accent
                      : document.settings.theme.textColor
                  }
                  onChange={(color) =>
                    selectedSectionTitle
                      ? setSelectedSectionTitleColor(color)
                      : setSelectedTextBlockColor(color)
                  }
                  onClear={() => setSelectedSectionTitleColor(undefined)}
                />
                <Input
                  aria-label={t("editor.link")}
                  className={styles.linkInput}
                  disabled={textToolsDisabled}
                  placeholder={t("editor.linkPlaceholder")}
                  value={resolvedLinkUrl}
                  onChange={(event) =>
                    setSelectedLinkUrlState({
                      selectionKey,
                      value: event.target.value,
                    })
                  }
                />
                <Button
                  disabled={textToolsDisabled}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => {
                    const href = resolvedLinkUrl.trim();

                    if (!href) return;

                    setSelectedLinkUrlState({ selectionKey, value: href });
                    runTextEditorCommand({ type: "setLink", href });
                  }}
                >
                  {t("editor.applyLink")}
                </Button>
                <Button
                  disabled={textToolsDisabled}
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => {
                    setSelectedLinkUrlState({ selectionKey, value: "" });
                    runTextEditorCommand({ type: "unsetLink" });
                  }}
                >
                  {t("editor.clearLink")}
                </Button>
              </div>
            ),
          },
        ];
      case "insert":
        return [
          {
            key: "section",
            label: t("editor.ribbon.group.section"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Button type="primary" onClick={() => store.getState().addSection()}>
                  {t("editor.addSection")}
                </Button>
                {quickInsertPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    onClick={() => store.getState().addSection(preset.id)}
                  >
                    {t("editor.addSectionPreset", { label: preset.label })}
                  </Button>
                ))}
              </div>
            ),
          },
          {
            key: "content",
            label: t("editor.ribbon.group.content"),
            content: (
              <div className={styles.ribbonControlGroup}>
                {listBlockPresets(locale).map((preset) => (
                  <Button
                    disabled={editSurfaceMode !== "content" || !selectedSection}
                    key={preset.id}
                    onClick={() => {
                      if (!selectedSection) return;
                      store.getState().addBlock({
                        sectionId: selectedSection.id,
                        blockPath: selection.blockPath,
                        presetId: preset.id,
                      });
                    }}
                  >
                    {t(preset.labelKey)}
                  </Button>
                ))}
              </div>
            ),
          },
        ];
      case "layout":
        return [
          {
            key: "page",
            label: t("editor.ribbon.group.page"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Tooltip title={t("editor.printSafeAreaTooltip")}>
                  <Button
                    aria-pressed={showPrintSafeArea}
                    type={showPrintSafeArea ? "primary" : "default"}
                    onClick={() => setShowPrintSafeArea((current) => !current)}
                  >
                    {t("editor.printSafeArea")}
                  </Button>
                </Tooltip>
                <Tooltip title={t("editor.refreshPaginationTooltip")}>
                  <Button
                    aria-label={t("editor.refreshPagination")}
                    loading={!paginationReady}
                    onClick={() => {
                      setPaginationReady(false);
                      setPaginationRevision((current) => current + 1);
                    }}
                  >
                    {t("editor.refreshPagination")}
                  </Button>
                </Tooltip>
              </div>
            ),
          },
        ];
      case "document":
        return [
          {
            key: "document",
            label: t("editor.ribbon.group.document"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Button
                  onClick={() => {
                    store.getState().setSelection({});
                    setActiveRibbonTab("properties");
                  }}
                >
                  {t("editor.documentProperties")}
                </Button>
                <ResumeSummaryEditor
                  initialSummary={resumeSummary}
                  resumeId={resumeId}
                  saveSummary={resolvedUpdateSummary}
                  triggerType="default"
                  version={initialVersion}
                  prepareSave={async () => {
                    await flushSave();
                    return store.getState().version;
                  }}
                  onSaved={(result) => {
                    setResumeSummary(result.summary);
                    store.getState().syncMetadataVersion(result);
                  }}
                />
                <Button onClick={() => void handleOpenVersionHistory()}>
                  {t("editor.versionHistory")}
                </Button>
              </div>
            ),
          },
          {
            key: "publish",
            label: t("editor.ribbon.group.publish"),
            content: (
              <div className={styles.ribbonControlGroup}>
                {publicHref ? (
                  <Button
                    data-testid="resume-publish-action"
                    disabled={publicationBusy}
                    onClick={() => setUnpublishOpen(true)}
                  >
                    {t("common.unpublish")}
                  </Button>
                ) : (
                  <Button
                    data-testid="resume-publish-action"
                    disabled={publicationBusy}
                    type="primary"
                    onClick={() => void handlePublish()}
                  >
                    {t("common.publish")}
                  </Button>
                )}
                {publicHref ? (
                  <Button data-testid="resume-open-public" href={publicHref}>
                    {t("common.openPublic")}
                  </Button>
                ) : null}
                {publicHref ? (
                  <Button onClick={() => void handleCopyPublicLink()}>
                    {publicLinkCopied
                      ? t("editor.publicLinkCopied")
                      : t("editor.copyPublicLink")}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ];
      case "properties":
        return [];
    }
  })();

  const ribbonPropertyContent = (
    <section className={styles.ribbonPropertyPanel} data-testid="editor-ribbon-property-panel">
      {inspectorContent}
    </section>
  );

  return (
    <main className={styles.shell} data-testid="resume-editor-shell">
      <EditorRibbon
        activeTab={activeRibbonTab}
        backHref="/app"
        backLabel={t("common.back")}
        commandGroups={ribbonCommandGroups}
        contextualContent={activeRibbonTab === "properties" ? ribbonPropertyContent : undefined}
        documentActions={documentActions}
        documentName={resumeName}
        documentNameLabel={t("editor.resumeTitle")}
        quickActions={quickActions}
        saveStatus={formatSaveStatus(saveStatus, t)}
        saveStatusTone={
          saveStatus === "dirty"
            ? "warning"
            : saveStatus === "saving"
              ? "processing"
              : saveStatus === "saved"
                ? "success"
                : saveStatus === "error"
                  ? "error"
                  : "neutral"
        }
        tabs={ribbonTabs}
        tablistLabel={t("editor.ribbon.label")}
        onDocumentNameChange={(title) => updateDocumentMeta({ title })}
        onTabChange={setActiveRibbonTab}
      />

      <Modal
        destroyOnHidden
        footer={null}
        open={versionHistoryOpen}
        title={t("editor.versionHistory")}
        onCancel={() => setVersionHistoryOpen(false)}
      >
        <div className={styles.versionHistoryModal}>
          <p className={styles.versionHistoryDescription}>
            {t("editor.versionHistoryDescription")}
          </p>
          <p className={styles.versionHistoryDescription}>
            {t("editor.versionHistoryRetention", {
              limit: versionHistoryLimit,
            })}
          </p>
          <Button
            block
            disabled={versionHistoryBusy}
            loading={versionHistoryBusy}
            type="primary"
            onClick={() => void handleCreateVersionSnapshot()}
          >
            {t("editor.createVersionSnapshot")}
          </Button>
          <div className={styles.versionHistoryList}>
            {versionSnapshots.map((snapshot) => (
              <div className={styles.versionHistoryItem} key={snapshot.id}>
                <div className={styles.versionHistoryMeta}>
                  <strong>{t("editor.versionLabel", { version: snapshot.version })}</strong>
                  <span>{formatVersionTimestamp(snapshot.createdAt, locale)}</span>
                </div>
                <div className={styles.versionHistoryActions}>
                  <Button
                    disabled={versionHistoryBusy}
                    onClick={() => void handleOpenVersionDiff(snapshot.id)}
                  >
                    {t("editor.diff.view")}
                  </Button>
                  <Popconfirm
                    cancelText={t("common.dismiss")}
                    description={t("editor.restoreVersionDescription")}
                    okText={t("editor.restoreVersion")}
                    title={t("editor.restoreVersionTitle")}
                    onConfirm={() => handleRestoreVersion(snapshot.id)}
                  >
                    <Button disabled={versionHistoryBusy}>
                      {t("editor.restoreVersion")}
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
          {versionHistoryPage.totalPages > 1 ? (
            <Pagination
              current={versionHistoryPage.page}
              disabled={versionHistoryBusy}
              pageSize={versionHistoryPage.pageSize}
              showSizeChanger={false}
              total={versionHistoryPage.total}
              onChange={(page) => void handleVersionHistoryPageChange(page)}
            />
          ) : null}
          {!versionHistoryBusy && !versionHistoryError && versionSnapshots.length === 0 ? (
            <p className={styles.versionHistoryDescription}>
              {t("editor.versionHistoryEmpty")}
            </p>
          ) : null}
        </div>
      </Modal>

      <ResumeDocumentDiffModal
        footer={
          <Button onClick={() => setVersionDiffOpen(false)}>
            {t("common.dismiss")}
          </Button>
        }
        loading={versionDiffLoading}
        loadingMessage={t("editor.diff.historyLoading")}
        open={versionDiffOpen}
        sourceDocument={versionDiffSnapshot?.document}
        sourceLabel={t("editor.diff.historyVersion")}
        targetDocument={document}
        targetLabel={t("editor.diff.currentVersion")}
        title={t("editor.diff.title")}
        onCancel={() => setVersionDiffOpen(false)}
      />

      <ActionConfirmationModal
        cancelText={t("common.dismiss")}
        confirmText={t("publication.unpublishConfirm")}
        description={t("publication.unpublishDescription", {
          title: resumeName,
        })}
        onCancel={() => setUnpublishOpen(false)}
        onConfirm={() => {
          setUnpublishOpen(false);
          void handleUnpublish();
        }}
        open={unpublishOpen}
        pending={publicationBusy}
        title={t("publication.unpublishTitle")}
      />

      {recoveryDraft || saveConflict ? (
        <>
          {recoveryDraft ? (
            <ResumeVersionDiffPrompt
              cloudDocument={initialDocument}
              description={t("editor.recoveryBody")}
              kind="recovery"
              localDocument={recoveryDraft.document}
              onUseCloud={async () => {
                store.getState().discardRecoveryDraft();
                await resolvedDraftRepository.deleteDraft(resumeId);
              }}
              onUseLocal={() => store.getState().restoreRecoveryDraft()}
            />
          ) : null}

          {saveConflict ? (
            <ResumeVersionDiffPrompt
              cloudDocument={conflictCloudResume?.document}
              description={t("editor.conflictBody", {
                version: saveConflict.currentVersion,
              })}
              error={activeConflictCloudResult?.status === "error"}
              kind="conflict"
              loading={!activeConflictCloudResult}
              localDocument={document}
              onUseCloud={async () => {
                if (!conflictCloudResume) return;
                store.getState().restoreServerVersion(conflictCloudResume);
                await resolvedDraftRepository.deleteDraft(resumeId);
              }}
              onUseLocal={() => {
                if (!conflictCloudResume) return;
                store.getState().keepLocalAfterConflict({
                  version: conflictCloudResume.version,
                  updatedAt: conflictCloudResume.updatedAt,
                });
              }}
            />
          ) : null}
        </>
      ) : null}

      <ResumeIconPicker
        open={iconPickerOpen}
        onCancel={() => setIconPickerOpen(false)}
        onSelect={(iconId) => {
          if (runTextEditorCommand({ type: "insertIcon", iconId })) {
            setIconPickerOpen(false);
          }
        }}
      />

      <section className={styles.body}>
        <aside
          aria-label={t("editor.outline")}
          className={`${styles.panel} ${styles.sidebar}`}
        >
          <div
            className={`${styles.columnStickyHeader} ${styles.sidebarHeader}`}
            data-testid="editor-outline-header"
          >
            <h2 className={styles.panelHeading}>{t("editor.outline")}</h2>
          </div>
          <p className={styles.panelDescription}>
            {t("editor.outlineDescription")}
          </p>
          <SectionOutline
            sections={document.sections}
            selectedSectionId={selection.sectionId}
            onSelectSection={handleOutlineSectionSelection}
            onMoveSection={(params) => store.getState().moveSection(params)}
            classNames={{
              outlineList: styles.outlineList,
              outlineItem: styles.outlineItem,
              outlineButton: styles.outlineButton,
              outlineMeta: styles.outlineMeta,
              compactActionRow: styles.compactActionRow,
            }}
          />
        </aside>

        <section
          aria-label={t("editor.canvas")}
          className={`${styles.panel} ${styles.canvasPanel}`}
        >
          <div
            className={`${styles.columnStickyHeader} ${styles.canvasHeader}`}
            data-testid="editor-canvas-header"
          >
            <div className={styles.canvasMeta}>
              <h2 className={styles.panelHeading}>{t("editor.canvas")}</h2>
            </div>
            <div className={styles.canvasHeaderActions}>
              <Tag className={styles.canvasModeTag} color="geekblue" variant="filled">
                {editSurfaceModeLabel}
              </Tag>
            </div>
          </div>
          <div
            ref={canvasViewportRef}
            className={styles.canvasViewport}
            onScroll={handleCanvasViewportScroll}
          >
            <div
              className={styles.canvasZoom}
              data-testid="resume-canvas-zoom"
              style={{ transform: `scale(${zoom})` }}
            >
              <ResumeRenderer
                document={document}
                mode="edit"
                editSurfaceMode={editSurfaceMode}
                paginationRevision={paginationRevision}
                showPrintSafeArea={showPrintSafeArea}
                zoom={zoom}
                selection={selection}
                onSelectBlock={(nextSelection) => store.getState().setSelection(nextSelection)}
                onChangeSectionTitle={(params) =>
                  store.getState().updateSectionTitle(params)
                }
                onChangeTextBlock={(params) =>
                  store.getState().updateTextBlockContent(params)
                }
                onMoveBlock={(params) => store.getState().moveBlock(params)}
                textEditorRef={textEditorRef}
                onTextEditorFormattingStateChange={(state) =>
                  setTextEditorFormattingState((current) => {
                    if (
                      current.selectionKey === selectionKey &&
                      current.value.bold === state.bold &&
                      current.value.italic === state.italic &&
                      current.value.underline === state.underline &&
                      current.value.strike === state.strike &&
                      current.value.tag === state.tag &&
                      current.value.textColor === state.textColor &&
                      current.value.linkHref === state.linkHref
                    ) {
                      return current;
                    }

                    return {
                      selectionKey,
                      value: state,
                    };
                  })
                }
                onPageCountChange={handlePageCountChange}
                onPaginationReadyChange={setPaginationReady}
              />
            </div>
          </div>
        </section>

      </section>
      <EditorStatusBar
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        currentPage={resolvedActivePage}
        pageCount={pageCount}
        statusBarLabel={t("editor.statusBar")}
        zoomInLabel={t("editor.zoomIn")}
        zoomLabel={formatZoomLabel(zoom)}
        zoomOutLabel={t("editor.zoomOut")}
        zoomResetLabel={t("editor.resetZoom")}
        onPageChange={handleCanvasPageChange}
        onResetZoom={() => store.getState().setZoom(1)}
        onZoomIn={() =>
          store
            .getState()
            .setZoom(Number((zoom + RESUME_EDITOR_ZOOM_STEP).toFixed(2)))
        }
        onZoomOut={() =>
          store
            .getState()
            .setZoom(Number((zoom - RESUME_EDITOR_ZOOM_STEP).toFixed(2)))
        }
      />
    </main>
  );
}
