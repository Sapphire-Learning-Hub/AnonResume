"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Select,
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
import { CanvasPageNavigation } from "@/components/editor/CanvasPageNavigation";
import { ResumeIconPicker } from "@/components/editor/ResumeIconPicker";
import {
  EditorFloatingNotice,
  EditorFloatingNoticeStack,
} from "@/components/editor/EditorFloatingNotice";
import { ResumeDocumentDiffModal } from "@/components/editor/ResumeDocumentDiffModal";
import { ResumeVersionDiffPrompt } from "@/components/editor/ResumeVersionDiffPrompt";
import { BlockInsertPanel } from "@/components/editor/inspector/BlockInsertPanel";
import { DraftInput } from "@/components/editor/inspector/DraftInput";
import { PaletteColorPicker } from "@/components/editor/inspector/PaletteColorPicker";
import { HelpIcon, WorkspaceBackIcon } from "@/components/ui/InlineIcons";
import type {
  TiptapTextBlockEditorCommand,
  TiptapTextBlockEditorFormatState,
  TiptapTextBlockEditorHandle,
} from "@/components/resume/TiptapTextBlockEditor";
import {
  findBlockByPath,
  findTextBlock,
  getBlockSiblingPosition,
} from "@/domain/resume/operations";
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
  ResumeSection,
  RichTextContent,
} from "@/domain/resume/schema";
import {
  createResumeDraftRepository,
  type ResumeDraftRepository,
} from "@/lib/resume-drafts";
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
} from "@/lib/resume-client";
import {
  createResumeEditorStore,
  RESUME_EDITOR_ZOOM_MAX,
  RESUME_EDITOR_ZOOM_MIN,
  RESUME_EDITOR_ZOOM_STEP,
  type ResumeEditorStoreState,
} from "@/stores/resume-editor";
import { useI18n } from "@/i18n/I18nProvider";

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

type InspectorMode = "badge" | "document" | "section" | "text";
type EditSurfaceMode = "content" | "layout";

function getInspectorMode(params: {
  selectedBadgeItem?: BadgeBlock["items"][number];
  selectedSection?: ResumeSection;
  selectedTextBlock?: ReturnType<typeof findTextBlock>;
  hasRichTextSelection: boolean;
}) {
  if (params.hasRichTextSelection || params.selectedTextBlock) {
    return "text" as const;
  }

  if (params.selectedBadgeItem) {
    return "badge" as const;
  }

  if (params.selectedSection) {
    return "section" as const;
  }

  return "document" as const;
}

function getInspectorTitle(
  mode: InspectorMode,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (mode) {
    case "text":
      return t("editor.textSettings");
    case "badge":
      return t("editor.badgeSettings");
    case "section":
      return t("editor.sectionSettings");
    case "document":
      return t("editor.documentSettings");
  }
}

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
  loadVersionSnapshots?: (resumeId: string) => Promise<ResumeVersionSnapshotSummary[]>;
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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editSurfaceMode, setEditSurfaceMode] = useState<EditSurfaceMode>("content");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionSnapshots, setVersionSnapshots] = useState<ResumeVersionSnapshotSummary[]>([]);
  const [versionHistoryBusy, setVersionHistoryBusy] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState(false);
  const [versionDiffOpen, setVersionDiffOpen] = useState(false);
  const [versionDiffLoading, setVersionDiffLoading] = useState(false);
  const [versionDiffError, setVersionDiffError] = useState(false);
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
  const selectedBadgeBlock =
    selection.sectionId && selection.blockPath
      ? findBlockByPath(
          selectedSection?.blocks ?? [],
          selection.blockPath,
        )
      : undefined;
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
    Boolean(selectedTextBlock) && (selectedBlockPosition?.index ?? -1) > 0;
  const canMoveSelectedBlockDown =
    Boolean(selectedTextBlock) &&
    selectedBlockPosition !== undefined &&
    selectedBlockPosition.index < selectedBlockPosition.count - 1;
  const canDeleteSelectedBlock = Boolean(selectedTextBlock);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const canZoomOut = zoom > RESUME_EDITOR_ZOOM_MIN;
  const canZoomIn = zoom < RESUME_EDITOR_ZOOM_MAX;
  const previewHref = `/app/resumes/${resumeId}/preview`;
  const publicHref = publishedSlug ? `/resume/${publishedSlug}` : undefined;
  const quickInsertPresets = listSectionPresets(locale).filter(
    (preset) => preset.id !== "custom",
  );
  const inspectorMode = getInspectorMode({
    selectedBadgeItem: editSurfaceMode === "content" ? selectedBadgeItem : undefined,
    selectedSection,
    selectedTextBlock: editSurfaceMode === "content" ? selectedTextBlock : undefined,
    hasRichTextSelection: Boolean(selectedRichTextContent),
  });
  const inspectorTitle = getInspectorTitle(inspectorMode, t);
  const editSurfaceModeLabel =
    editSurfaceMode === "layout"
      ? t("editor.layoutSorting")
      : t("editor.contentEditing");
  const shellStyle = {
    "--editor-sticky-offset": "64px",
  } as CSSProperties;

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

  async function loadVersionHistory() {
    const snapshots = await resolvedLoadVersionSnapshots(resumeId);

    setVersionSnapshots(snapshots);
  }

  async function handleOpenVersionHistory() {
    setVersionHistoryOpen(true);
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      await loadVersionHistory();
    } catch {
      setVersionHistoryError(true);
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
      await loadVersionHistory();
    } catch {
      setVersionHistoryError(true);
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  async function handleOpenVersionDiff(snapshotId: string) {
    setVersionDiffOpen(true);
    setVersionDiffLoading(true);
    setVersionDiffError(false);
    setVersionDiffSnapshot(undefined);

    try {
      const snapshot = await resolvedLoadVersionSnapshot({
        resumeId,
        snapshotId,
      });

      setVersionDiffSnapshot(snapshot);
    } catch {
      setVersionDiffError(true);
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

  const textFormattingContent = selectedRichTextContent ? (
    <div className={styles.panelSection}>
      <div className={styles.drawerSectionHeader}>
        <h3 className={styles.drawerSectionTitle}>{t("editor.textFormatting")}</h3>
      </div>
      <div className={styles.richTextToolbar}>
        <Button
          disabled={textToolsDisabled}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => setIconPickerOpen(true)}
        >
          {t("editor.iconLibrary.open")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          aria-pressed={resolvedFormattingState.bold}
          type={resolvedFormattingState.bold ? "primary" : "default"}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runTextEditorCommand({ type: "toggleBold" })}
        >
          {t("editor.bold")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          aria-pressed={resolvedFormattingState.italic}
          type={resolvedFormattingState.italic ? "primary" : "default"}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runTextEditorCommand({ type: "toggleItalic" })}
        >
          {t("editor.italic")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          aria-pressed={resolvedFormattingState.underline}
          type={resolvedFormattingState.underline ? "primary" : "default"}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runTextEditorCommand({ type: "toggleUnderline" })}
        >
          {t("editor.underline")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          aria-pressed={resolvedFormattingState.strike}
          type={resolvedFormattingState.strike ? "primary" : "default"}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runTextEditorCommand({ type: "toggleStrike" })}
        >
          {t("editor.strike")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          aria-pressed={resolvedFormattingState.tag}
          type={resolvedFormattingState.tag ? "primary" : "default"}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => runTextEditorCommand({ type: "toggleTag" })}
        >
          {t("editor.inlineTag")}
        </Button>
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

            if (!href) {
              return;
            }

            setSelectedLinkUrlState({
              selectionKey,
              value: href,
            });
            runTextEditorCommand({ type: "setLink", href });
          }}
        >
          {t("editor.applyLink")}
        </Button>
        <Button
          disabled={textToolsDisabled}
          onMouseDown={preventToolbarMouseDown}
          onClick={() => {
            setSelectedLinkUrlState({
              selectionKey,
              value: "",
            });
            runTextEditorCommand({ type: "unsetLink" });
          }}
        >
          {t("editor.clearLink")}
        </Button>
      </div>
    </div>
  ) : null;

  const inspectorContent = selectedSectionTitle && selectedSection ? (
    <>
      <div className={styles.panelActionRow}>
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
    </>
  ) : selectedTextBlock && selection.blockPath ? (
    <>
      <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("editor.textColor")}</span>
          <PaletteColorPicker
            className={styles.colorControl}
            label={t("editor.textColor")}
            paletteLabel={t("common.colorPalette")}
            value={selectedTextBlock.style?.color ?? ""}
            placeholder="#0f172a"
            onChange={(color) => updateSelectedTextBlockStyle({ color })}
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
      {selectedSection ? (
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
      ) : null}
    </>
  ) : selectedBadgeBlock?.type === "badges" && selectedBadgeItem && selection.blockPath ? (
    <>
      <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow}>
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
    </>
  ) : selectedSection ? (
    <>
      <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("common.sectionGap")}</span>
          <DraftInput
            aria-label={t("common.sectionGap")}
            type="number"
            value={selectedSection.layout?.gap?.toString() ?? ""}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(gap) => updateSelectedSectionLayout({ gap })}
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
      <div className={styles.panelActionRow}>
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
    </>
  ) : (
    <>
      <div className={styles.inspectorControlGrid}>
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("editor.resumeTitle")}</span>
          <DraftInput
            data-testid="resume-title-input"
            aria-label={t("editor.resumeTitle")}
            value={document.meta.title}
            parseValue={(title) => (title.trim() ? title : undefined)}
            onValidValueChange={(title) =>
              updateDocumentMeta({
                title,
              })
            }
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
            onChange={(nextLocale) => {
              updateDocumentMeta({
                locale: nextLocale,
              });
            }}
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
              if (presetId === "custom") {
                return;
              }

              store.getState().updateDocument((current) =>
                applyResumeVisualPreset(current, presetId),
              );
            }}
          />
        </div>
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("common.fontFamily")}</span>
          <Select
            data-testid="document-font-family-select"
            aria-label={t("common.fontFamily")}
            showSearch
            filterOption={(input, option) => {
              const value = typeof option?.value === "string" ? option.value : "";
              const matchingPreset = listResumeFontPresets().find(
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
            options={[
              ...listResumeFontPresets().map((preset) => ({
                value: preset.fontFamily,
                label: (
                  <span
                    className={styles.fontPresetOption}
                    style={{ fontFamily: preset.resolvedFontFamily }}
                  >
                    <span className={styles.fontPresetName}>{preset.name}</span>
                    <span className={styles.fontPresetMeta}>
                      {t(preset.descriptionKey)} · {t("editor.fontPreset.license")}
                    </span>
                  </span>
                ),
              })),
              ...(
                listResumeFontPresets().some(
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
            onChange={(fontFamily) => {
              updateDocumentTypography({ fontFamily });
            }}
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.inspectorControlRow}>
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
        <div className={styles.colorThemeGroup} data-testid="document-theme-colors">
          <span className={styles.inspectorControlLabel}>{t("editor.colorTheme")}</span>
          <div className={styles.colorThemeGrid}>
            <div className={styles.colorThemeItem}>
              <span className={styles.colorThemeLabel}>{t("editor.accentTone")}</span>
              <PaletteColorPicker
                className={styles.colorControl}
                label={t("common.accentColor")}
                paletteLabel={t("common.colorPalette")}
                value={document.settings.theme.accent}
                placeholder="#0f62fe"
                onChange={(accent) => updateDocumentTheme({ accent })}
              />
            </div>
            <div className={styles.colorThemeItem}>
              <span className={styles.colorThemeLabel}>{t("editor.textTone")}</span>
              <PaletteColorPicker
                className={styles.colorControl}
                label={t("common.textThemeColor")}
                paletteLabel={t("common.colorPalette")}
                value={document.settings.theme.textColor}
                placeholder="#0f172a"
                onChange={(textColor) => updateDocumentTheme({ textColor })}
              />
            </div>
            <div className={styles.colorThemeItem}>
              <span className={styles.colorThemeLabel}>{t("editor.mutedTone")}</span>
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
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("common.pageMarginTop")}</span>
          <DraftInput
            aria-label={t("common.pageMarginTop")}
            type="number"
            value={document.settings.page.margin.top.toString()}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(top) => updateDocumentPageMargin({ top })}
          />
        </div>
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("common.pageMarginRight")}</span>
          <DraftInput
            aria-label={t("common.pageMarginRight")}
            type="number"
            value={document.settings.page.margin.right.toString()}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(right) => updateDocumentPageMargin({ right })}
          />
        </div>
        <div className={styles.inspectorControlRow}>
          <span className={styles.inspectorControlLabel}>{t("common.pageMarginBottom")}</span>
          <DraftInput
            aria-label={t("common.pageMarginBottom")}
            type="number"
            value={document.settings.page.margin.bottom.toString()}
            parseValue={parseNonNegativeNumber}
            onValidValueChange={(bottom) => updateDocumentPageMargin({ bottom })}
          />
        </div>
        <div className={styles.inspectorControlRow}>
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
    </>
  );

  const blockInsertContent =
    editSurfaceMode === "content" && selectedSection ? (
      <BlockInsertPanel
        insertAfterSelection={Boolean(selection.blockPath?.length)}
        onInsert={(presetId) =>
          store.getState().addBlock({
            sectionId: selectedSection.id,
            blockPath: selection.blockPath,
            presetId,
          })
        }
      />
    ) : null;

  return (
    <main className={styles.shell} style={shellStyle}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarIdentity}>
          <Button
            aria-label={t("common.back")}
            className={styles.backButton}
            href="/app"
            title={t("common.back")}
            type="text"
          >
            <WorkspaceBackIcon size={18} />
          </Button>
          <div className={styles.titleStack}>
            <span className={styles.toolbarLabel}>{t("editor.resumeName")}</span>
            <span className={styles.toolbarValue}>{resumeName}</span>
          </div>

          <div className={styles.saveStatus}>
            <span className={styles.toolbarLabel}>{t("editor.saveStatus")}</span>
            <span className={styles.toolbarValue} data-testid="resume-save-status">
              {formatSaveStatus(saveStatus, t)}
            </span>
          </div>
        </div>

        <div className={styles.toolbarActionRail}>
          <div className={styles.toolbarActionGroup}>
            <Button
              type={editSurfaceMode === "content" ? "primary" : "default"}
              aria-pressed={editSurfaceMode === "content"}
              onClick={() => handleEditSurfaceModeChange("content")}
            >
              {t("editor.contentEditing")}
            </Button>
            <Button
              type={editSurfaceMode === "layout" ? "primary" : "default"}
              aria-pressed={editSurfaceMode === "layout"}
              onClick={() => handleEditSurfaceModeChange("layout")}
            >
              {t("editor.layoutSorting")}
            </Button>
          </div>

          <div className={styles.toolbarActionGroup}>
            <Button
              disabled={!canUndo}
              title={t("editor.undoShortcut")}
              onClick={() => store.getState().undo()}
            >
              {t("editor.undo")}
            </Button>
            <Button
              disabled={!canRedo}
              title={t("editor.redoShortcut")}
              onClick={() => store.getState().redo()}
            >
              {t("editor.redo")}
            </Button>
            <Button
              disabled={!canZoomOut}
              onClick={() =>
                store.getState().setZoom(Number((zoom - RESUME_EDITOR_ZOOM_STEP).toFixed(2)))
              }
            >
              {t("editor.zoomOut")}
            </Button>
            <Button onClick={() => store.getState().setZoom(1)}>
              {t("editor.resetZoom")}
            </Button>
            <Button
              disabled={!canZoomIn}
              onClick={() =>
                store.getState().setZoom(Number((zoom + RESUME_EDITOR_ZOOM_STEP).toFixed(2)))
              }
            >
              {t("editor.zoomIn")}
            </Button>
            <span className={styles.toolbarLabel}>{formatZoomLabel(zoom)}</span>
          </div>

          <div className={styles.toolbarActionGroup}>
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
            <Button
              disabled={!dirty || saveStatus === "saving"}
              loading={saveStatus === "saving"}
              title={t("editor.saveShortcut")}
              onClick={handleManualSave}
            >
              {t("editor.save")}
            </Button>
            <Button href={previewHref}>{t("common.preview")}</Button>
            {publicHref ? (
              <Button
                data-testid="resume-publish-action"
                disabled={publicationBusy}
                onClick={() => void handleUnpublish()}
              >
                {t("common.unpublish")}
              </Button>
            ) : (
              <Button
                data-testid="resume-publish-action"
                disabled={publicationBusy}
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
            <Button
              type="primary"
              disabled={pdfBusy}
              loading={pdfBusy}
              onClick={() => void handleExportPdf()}
            >
              {t("common.pdf")}
            </Button>
          </div>
        </div>
      </header>

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
          {versionHistoryError ? (
            <p className={styles.versionHistoryError}>{t("editor.versionHistoryError")}</p>
          ) : null}
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
          {!versionHistoryBusy && !versionHistoryError && versionSnapshots.length === 0 ? (
            <p className={styles.versionHistoryDescription}>
              {t("editor.versionHistoryEmpty")}
            </p>
          ) : null}
        </div>
      </Modal>

      <ResumeDocumentDiffModal
        error={versionDiffError}
        errorMessage={t("editor.diff.historyLoadError")}
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

      {recoveryDraft || saveValidation || saveConflict ? (
        <EditorFloatingNoticeStack>
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

          {saveValidation ? (
            <EditorFloatingNotice
              actions={
                <Button
                  onClick={() => store.getState().clearSaveValidation()}
                  size="small"
                >
                  {t("common.dismiss")}
                </Button>
              }
              ariaLabel={t("editor.validationTitle")}
              description={
                saveValidation.issues[0]?.message ?? t("editor.invalidPayload")
              }
              title={t("editor.validationTitle")}
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
        </EditorFloatingNoticeStack>
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
          <div className={styles.panelSection}>
            <span className={styles.sectionEyebrow}>{t("editor.addSection")}</span>
            <div className={styles.panelActionRow}>
              <Button type="primary" onClick={() => store.getState().addSection()}>
                {t("editor.addSection")}
              </Button>
            </div>
            <div className={styles.presetButtonList}>
              {quickInsertPresets.map((preset) => (
                <Button
                  key={preset.id}
                  onClick={() => store.getState().addSection(preset.id)}
                >
                  {t("editor.addSectionPreset", { label: preset.label })}
                </Button>
              ))}
            </div>
          </div>
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
              <span className={styles.canvasPageCount}>
                {t("editor.pageCount", { count: pageCount })}
              </span>
              {pageCount > 1 ? (
                <CanvasPageNavigation
                  current={resolvedActivePage}
                  pageCount={pageCount}
                  onChange={handleCanvasPageChange}
                />
              ) : null}
            </div>
            <div className={styles.canvasHeaderActions}>
              <Tooltip title={t("editor.printSafeAreaTooltip")}>
                <Button
                  aria-label={t("editor.printSafeArea")}
                  aria-pressed={showPrintSafeArea}
                  className={styles.canvasSafeAreaButton}
                  size="small"
                  onClick={() => setShowPrintSafeArea((current) => !current)}
                >
                  {t("editor.printSafeArea")}
                </Button>
              </Tooltip>
              <Tooltip title={t("editor.refreshPaginationTooltip")}>
                <Button
                  aria-label={t("editor.refreshPagination")}
                  className={styles.canvasSafeAreaButton}
                  loading={!paginationReady}
                  size="small"
                  onClick={() => {
                    setPaginationReady(false);
                    setPaginationRevision((current) => current + 1);
                  }}
                >
                  {t("editor.refreshPagination")}
                </Button>
              </Tooltip>
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

        <aside
          aria-label={t("editor.inspector")}
          className={`${styles.panel} ${styles.inspectorPanel}`}
          data-testid="resume-inspector-panel"
        >
          <div
            className={`${styles.columnStickyHeader} ${styles.inspectorPanelHeader}`}
            data-testid="editor-inspector-header"
          >
            <div className={styles.canvasMeta}>
              <h2 className={styles.panelHeading}>{inspectorTitle}</h2>
            </div>
            {inspectorMode !== "document" ? (
              <Button
                size="small"
                type="text"
                onClick={() => store.getState().setSelection({})}
              >
                {t("editor.documentSettings")}
              </Button>
            ) : null}
          </div>
          <div
            className={styles.drawerContent}
            data-testid="editor-inspector-scroll-content"
          >
            {blockInsertContent}
            {textFormattingContent}
            {inspectorContent}
          </div>
        </aside>
      </section>
    </main>
  );
}
