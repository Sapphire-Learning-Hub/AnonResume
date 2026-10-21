"use client";
import { DiagnosticReference } from "@/components/system/DiagnosticReference";
import { attachErrorDiagnostic, getErrorDiagnostic } from "@/lib/observability/diagnostics/schema";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  Button,
  Checkbox,
  Dropdown,
  Modal,
  Pagination,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  AppstoreAddOutlined,
  BoldOutlined,
  DownOutlined,
  FileAddOutlined,
  FileTextOutlined,
  ItalicOutlined,
  LinkOutlined,
  PlusSquareOutlined,
  ReloadOutlined,
  StrikethroughOutlined,
  TagOutlined,
  UnderlineOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useStore } from "zustand";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel";
import { AiReviewPanel } from "@/components/ai/review/AiReviewPanel";
import {
  applySelectedAiChanges,
  type AiResumeProposal,
} from "@/domain/resume/ai/proposal-apply";
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
import { EditorShortcutPanel } from "@/components/editor/EditorShortcutPanel";
import { ResumeOnboardingController } from "@/components/editor/onboarding/ResumeOnboardingController";
import { EditorWorkspaceSidebar } from "@/components/editor/navigation/EditorWorkspaceSidebar";
import { EditorWorkspaceResizeHandle } from "@/components/editor/navigation/EditorWorkspaceResizeHandle";
import { MarkdownEditingWorkspace } from "@/components/editor/markdown/MarkdownEditingWorkspace";
import { getResumeMarkdownDiagnosticMessage } from "@/i18n/resume-markdown-diagnostics";
import { useResumeMarkdownSession } from "@/components/editor/markdown/useResumeMarkdownSession";
import { ResumeIconPicker } from "@/components/editor/ResumeIconPicker";
import { SectionPresetCommands } from "@/components/editor/section-presets/SectionPresetCommands";
import {
  ResumeLinkDialog,
  type ResumeLinkDraft,
} from "@/components/editor/link/ResumeLinkDialog";
import { getContextRibbonKind } from "@/components/editor/ribbon/context-tab";
import { ResumeDocumentDiffModal } from "@/components/editor/ResumeDocumentDiffModal";
import { ResumeVersionDiffPrompt } from "@/components/editor/ResumeVersionDiffPrompt";
import { DraftInput } from "@/components/editor/inspector/DraftInput";
import { PaletteColorPicker } from "@/components/ui/PaletteColorPicker";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { AppRouteLink, AppRouteLoadingHold } from "@/components/ui/AppRouteLoading";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import {
  AiAssistantIcon,
  EnterFullscreenIcon,
  ExitFullscreenIcon,
  HelpIcon,
  HistoryIcon,
  HomeIcon,
  InsertIcon,
  KeyboardIcon,
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
import { ResumeLinkDialogContext } from "@/components/resume/TiptapTextBlockEditor";
import {
  createRichTextFromPlainText,
  findBlockByPath,
  findTextBlock,
  getBlockSiblingPosition,
  getPlainTextFromRichText,
} from "@/domain/resume/operations";
import { listBlockPresets } from "@/domain/resume/block-presets";
import { listSectionPresets } from "@/domain/resume/presets";
import {
  getResumeStructuralBlockGap,
  RESUME_DEFAULT_BLOCK_GAP_PX,
  RESUME_DEFAULT_SECTION_COLUMNS,
  RESUME_DEFAULT_SECTION_PADDING_PX,
  RESUME_DEFAULT_SECTION_TITLE_FONT_SIZE_PX,
  RESUME_DEFAULT_TEXT_FONT_WEIGHT,
} from "@/domain/resume/presentation/defaults";
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
  ResumeDocument,
  RichTextContent,
} from "@/domain/resume/schema";
import {
  createResumeDraftRepository,
  type ResumeDraftRepository,
} from "@/lib/resume/drafts";
import type { ResumeMarkdownDraftRepository } from "@/lib/resume/markdown-drafts";
import {
  exportResumePdfDocument,
  createResumeVersionSnapshot,
  ResumeTrashedClientError,
  ResumeSnapshotUnavailableClientError,
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
import { restartEditorOnboardingClient } from "@/lib/onboarding/client";
import type { EditorOnboardingRun } from "@/lib/onboarding/types";

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

type EditSurfaceMode = "content" | "layout" | "markdown";
type EditorWorkspaceStyle = CSSProperties & {
  "--editor-workspace-panel-width": string;
};

const TEMPORARY_LAYOUT_HOLD_DELAY_MS = 200;
const OUTLINE_PANEL_DEFAULT_WIDTH = 340;
const MARKDOWN_PANEL_FALLBACK_WIDTH = 560;
const WORKSPACE_PANEL_MIN_WIDTH = 260;
const OUTLINE_PANEL_MAX_WIDTH = 640;
const MARKDOWN_PANEL_INITIAL_MAX_WIDTH = 640;

export function ResumeEditorShell({
  resumeId,
  publicSlug,
  initialDocument,
  initialSummary = "",
  initialVersion = 1,
  initialUpdatedAt = 0,
  autosaveDelayMs = 800,
  draftRepository,
  markdownDraftRepository,
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
  onboardingRun,
}: {
  resumeId: string;
  publicSlug?: string;
  initialDocument: ResumeEditorStoreState["document"];
  initialSummary?: string;
  initialVersion?: number;
  initialUpdatedAt?: number;
  autosaveDelayMs?: number;
  draftRepository?: ResumeDraftRepository;
  markdownDraftRepository?: ResumeMarkdownDraftRepository;
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
  ) => Promise<PageResult<ResumeVersionSnapshotSummary> & { autosave?: ResumeVersionSnapshotSummary | null }>;
  loadVersionSnapshot?: (params: {
    resumeId: string;
    snapshotId: string;
  }) => Promise<ResumeVersionSnapshotDetail>;
  createVersionSnapshot?: (resumeId: string, sourceSnapshotId?: string) => Promise<ResumeVersionSnapshotSummary>;
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
  onboardingRun?: EditorOnboardingRun;
}) {
  const { styles } = useResumeEditorShellStyles();
  const { locale, t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const router = useRouter();
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
  const markdownSession = useResumeMarkdownSession({
    resumeId,
    locale,
    store,
    draftRepository: markdownDraftRepository,
  });
  const [resumeSummary, setResumeSummary] = useState(initialSummary);
  const [localDraftUnavailable, setLocalDraftUnavailable] = useState(false);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const deleteLocalDraft = useCallback(
    async (id: string) => {
      try {
        await resolvedDraftRepository.deleteDraft(id);
      } catch {
        setLocalDraftUnavailable(true);
      }
    },
    [resolvedDraftRepository],
  );

  const flushSave = useCallback(async () => {
    if (store.getState().saveBlockedReason) throw new ResumeTrashedClientError();
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
          await deleteLocalDraft(snapshot.resumeId);
        }
      } catch (error) {
        if (error instanceof ResumeTrashedClientError) {
          store.getState().setResumeTrashed();
        } else if (error instanceof ResumeVersionConflictClientError) {
          store.getState().setSaveConflict({
            currentVersion: error.currentVersion,
          });
        } else if (error instanceof ResumeValidationClientError) {
          store.getState().setSaveValidation({
            issues: error.issues,
          });
        } else {
          store.getState().setSaveStatus("error", getErrorDiagnostic(error));
        }

        throw attachErrorDiagnostic(new Error("save_failed"), getErrorDiagnostic(error));
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
  }, [deleteLocalDraft, resolvedSaveDocument, store]);

  const handleManualSave = useCallback(() => {
    void (async () => {
      if (markdownSession.active && !(await markdownSession.flush())) return;
      await flushSave();
    })().catch(() => {
      // The persistence layer exposes failures through the existing editor state.
    });
  }, [flushSave, markdownSession]);
  const manualSaveRef = useRef(handleManualSave);
  useEffect(() => {
    manualSaveRef.current = handleManualSave;
  }, [handleManualSave]);

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

  useResumePersistence({
    store,
    draftRepository: resolvedDraftRepository,
    saveDocument: resolvedSaveDocument,
    flushSave,
    debounceMs: autosaveDelayMs,
    initialUpdatedAt,
    onDraftStorageStatusChange: setLocalDraftUnavailable,
  });

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!store.getState().dirty && !markdownSession.hasSourceChanges) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [markdownSession.hasSourceChanges, store]);

  const document = useStore(store, (state) => state.document);
  const recoveryDraft = useStore(store, (state) => state.recoveryDraft);
  const saveConflict = useStore(store, (state) => state.saveConflict);
  const saveValidation = useStore(store, (state) => state.saveValidation);
  const selection = useStore(store, (state) => state.selection);
  const saveStatus = useStore(store, (state) => state.saveStatus);
  const saveBlockedReason = useStore(store, (state) => state.saveBlockedReason);
  const saveDiagnosticId = useStore(store, (state) => state.saveDiagnosticId);
  const version = useStore(store, (state) => state.version);
  const history = useStore(store, (state) => state.history);
  const zoom = useStore(store, (state) => state.zoom);
  const resumeName = useStore(store, (state) => state.document.meta.title);
  const textEditorRef = useRef<TiptapTextBlockEditorHandle>(null);
  const publicLinkCopiedTimerRef = useRef<number | undefined>(undefined);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const workspaceBodyRef = useRef<HTMLElement>(null);
  const markdownPanelMeasuredRef = useRef(false);
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
  const [linkDialogDraft, setLinkDialogDraft] = useState<ResumeLinkDraft>();
  const [publishedSlug, setPublishedSlug] = useState(publicSlug);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editSurfaceMode, setEditSurfaceMode] = useState<EditSurfaceMode>("content");
  const [outlinePanelWidth, setOutlinePanelWidth] = useState(
    OUTLINE_PANEL_DEFAULT_WIDTH,
  );
  const [markdownPanelWidth, setMarkdownPanelWidth] = useState(
    MARKDOWN_PANEL_FALLBACK_WIDTH,
  );
  const [markdownPanelMaxWidth, setMarkdownPanelMaxWidth] = useState(
    MARKDOWN_PANEL_INITIAL_MAX_WIDTH,
  );
  const [pendingMarkdownExitMode, setPendingMarkdownExitMode] =
    useState<Exclude<EditSurfaceMode, "markdown">>();
  const [markdownModeBusy, setMarkdownModeBusy] = useState(false);
  const [temporaryLayoutMode, setTemporaryLayoutMode] = useState(false);
  const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiMenuKeyboard, setAiMenuKeyboard] = useState(false);
  const [aiSuggestionConversationId, setAiSuggestionConversationId] = useState<string>();
  const [aiProposalPreview, setAiProposalPreview] = useState<{
    document: ResumeDocument;
    proposal: AiResumeProposal;
    baseResumeVersion: number;
    selectedChangeIds: string[];
  }>();
  const [aiPreviewMode, setAiPreviewMode] = useState<"original" | "effect">(
    "effect",
  );
  const [activeRibbonTab, setActiveRibbonTab] = useState<EditorRibbonTab>("home");
  const [lastPermanentRibbonTab, setLastPermanentRibbonTab] =
    useState<Exclude<EditorRibbonTab, "context">>("home");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionSnapshots, setVersionSnapshots] = useState<ResumeVersionSnapshotSummary[]>([]);
  const [autosaveSnapshot, setAutosaveSnapshot] = useState<ResumeVersionSnapshotSummary | null>(null);
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
  const [initialPaginationReady, setInitialPaginationReady] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const activeEditSurfaceMode: EditSurfaceMode =
    editSurfaceMode === "markdown"
      ? "markdown"
      : temporaryLayoutMode
        ? "layout"
        : editSurfaceMode;
  const workspacePanelWidth =
    activeEditSurfaceMode === "markdown"
      ? Math.min(markdownPanelWidth, markdownPanelMaxWidth)
      : outlinePanelWidth;
  const workspaceStyle: EditorWorkspaceStyle = {
    "--editor-workspace-panel-width": `${workspacePanelWidth}px`,
  };
  const resolvedActivePage = Math.min(Math.max(activePage, 1), pageCount);
  const canvasDocument =
    aiProposalPreview && aiPreviewMode === "effect"
      ? aiProposalPreview.document
      : document;

  const handlePaginationReadyChange = useCallback((ready: boolean) => {
    setPaginationReady(ready);
    if (ready) setInitialPaginationReady(true);
  }, []);

  useEffect(() => {
    const body = workspaceBodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries.find((entry) => entry.target === body)?.contentRect
        .width;
      if (!width) return;

      const nextMaxWidth = Math.max(
        WORKSPACE_PANEL_MIN_WIDTH,
        Math.floor(width / 2),
      );
      const nextDefaultWidth = Math.max(
        WORKSPACE_PANEL_MIN_WIDTH,
        Math.floor(width / 3),
      );
      setMarkdownPanelMaxWidth(nextMaxWidth);
      if (!markdownPanelMeasuredRef.current) {
        markdownPanelMeasuredRef.current = true;
        setMarkdownPanelWidth(Math.min(nextDefaultWidth, nextMaxWidth));
      } else {
        setMarkdownPanelWidth((currentWidth) =>
          Math.min(currentWidth, nextMaxWidth),
        );
      }
    });

    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  function previewAiProposal(input: {
    proposal: AiResumeProposal;
    baseResumeVersion: number;
    selectedChangeIds: string[];
  }) {
    const result = applySelectedAiChanges({
      document,
      currentVersion: version,
      ...input,
    });
    if (!result.ok) return false;
    setAiProposalPreview({ ...input, document: result.document });
    setAiPreviewMode("effect");
    return true;
  }

  useEffect(() => {
    let holdTimer: number | undefined;

    function clearHoldTimer() {
      if (holdTimer === undefined) return;

      window.clearTimeout(holdTimer);
      holdTimer = undefined;
    }

    function stopTemporaryLayoutMode() {
      clearHoldTimer();
      setTemporaryLayoutMode(false);
    }

    function handleEditorKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "/") {
        event.preventDefault();
        stopTemporaryLayoutMode();
        setShortcutPanelOpen(true);
        return;
      }

      if (event.key === "Control") {
        if (event.repeat || holdTimer !== undefined) return;

        if (editSurfaceMode === "markdown") return;

        holdTimer = window.setTimeout(() => {
          holdTimer = undefined;
          setTemporaryLayoutMode(true);
        }, TEMPORARY_LAYOUT_HOLD_DELAY_MS);
        return;
      }

      if (event.ctrlKey) {
        stopTemporaryLayoutMode();
      }
    }

    function handleEditorKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") {
        stopTemporaryLayoutMode();
      }
    }

    function handleVisibilityChange() {
      if (globalThis.document.visibilityState === "hidden") {
        stopTemporaryLayoutMode();
      }
    }

    window.addEventListener("keydown", handleEditorKeyDown);
    window.addEventListener("keyup", handleEditorKeyUp);
    window.addEventListener("blur", stopTemporaryLayoutMode);
    globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearHoldTimer();
      window.removeEventListener("keydown", handleEditorKeyDown);
      window.removeEventListener("keyup", handleEditorKeyUp);
      window.removeEventListener("blur", stopTemporaryLayoutMode);
      globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [editSurfaceMode]);
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
    if (!localDraftUnavailable) return;
    const key = "editor-local-draft-unavailable";
    notification.warning({
      key,
      duration: false,
      title: t("editor.localDraftUnavailable"),
      description: t("editor.localDraftUnavailableDescription"),
      actions: (
        <Button size="small" onClick={() => manualSaveRef.current()}>
          {t("editor.saveToCloud")}
        </Button>
      ),
    });
    return () => notification.destroy(key);
  }, [localDraftUnavailable, notification, t]);

  useEffect(() => {
    if (!saveBlockedReason) return;
    const key = "editor-resume-trashed";
    notification.warning({ key, duration: false, title: t("editor.resumeTrashed"),
      description: t("editor.resumeTrashedDescription"),
      actions: <AppRouteLink href="/app">{t("common.back")}</AppRouteLink> });
    return () => notification.destroy(key);
  }, [notification, saveBlockedReason, t]);

  useEffect(() => {
    const key = "editor-autosave-error";
    if (saveStatus !== "error" || saveBlockedReason) {
      notification.destroy(key);
      return;
    }

    notification.error({
      actions: (
        <Button size="small" onClick={handleManualSave}>
          {t("editor.retrySave")}
        </Button>
      ),
      duration: false,
      key,
      role: "alert",
      title: t("editor.saveError"),
      description: <DiagnosticReference diagnosticId={saveDiagnosticId} />,
    });
    return () => notification.destroy(key);
  }, [handleManualSave, notification, saveBlockedReason, saveDiagnosticId, saveStatus, t]);

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
  const contextRibbonKind = getContextRibbonKind(selection, selectedBlock?.type);
  const effectiveRibbonTab =
    activeEditSurfaceMode === "markdown"
      ? "home"
      : activeRibbonTab === "context" && !contextRibbonKind
        ? lastPermanentRibbonTab
        : activeRibbonTab;

  useEffect(() => {
    if (activeRibbonTab !== "context" || contextRibbonKind) return;

    window.document.getElementById(`editor-ribbon-tab-${lastPermanentRibbonTab}`)?.focus();
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setActiveRibbonTab(lastPermanentRibbonTab);
    });
    return () => { cancelled = true; };
  }, [activeRibbonTab, contextRibbonKind, lastPermanentRibbonTab]);

  function selectRibbonTab(tab: EditorRibbonTab) {
    if (tab !== "context") setLastPermanentRibbonTab(tab);
    setActiveRibbonTab(tab);
  }
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
    activeEditSurfaceMode === "content"
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
  const initialFormattingState = getInitialFormattingState(selectedRichTextContent);
  const resolvedFormattingState =
    selectionKey && selectionKey === textEditorFormattingState.selectionKey
      ? textEditorFormattingState.value
      : initialFormattingState;
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

  function openLinkDialog() {
    const draft = textEditorRef.current?.prepareLink();

    if (draft) setLinkDialogDraft(draft);
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

  function setSelectedTextBlockColor(color?: string) {
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

  function commitBadgeItem({
    sectionId,
    blockPath,
    itemId,
    text,
  }: {
    sectionId: string;
    blockPath: string[];
    itemId: string;
    text: string;
  }) {
    const current = store.getState();
    const section = current.document.sections.find((item) => item.id === sectionId);
    const block = section ? findBlockByPath(section.blocks, blockPath) : undefined;

    if (block?.type !== "badges") return;

    const itemIndex = block.items.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;

    const nextText = text.trim();
    if (!nextText) {
      if (block.items.length === 1) {
        current.deleteBlock({ sectionId, blockPath });
        return;
      }

      const items = block.items.filter((item) => item.id !== itemId);
      current.updateBadgeItems({ sectionId, blockPath, items });
      if (current.selection.badgeItemId === itemId) {
        const fallback = items[itemIndex] ?? items[itemIndex - 1];
        current.setSelection(
          fallback
            ? { sectionId, blockPath, badgeItemId: fallback.id }
            : { sectionId, blockPath },
        );
      }
      return;
    }

    if (block.items[itemIndex]?.text !== nextText) {
      current.updateBadgeItems({
        sectionId,
        blockPath,
        items: block.items.map((item) =>
          item.id === itemId ? { ...item, text: nextText } : item,
        ),
      });
    }
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
    activeEditSurfaceMode === "markdown"
      ? t("editor.markdownEditing")
      : activeEditSurfaceMode === "layout"
        ? t("editor.layoutSorting")
        : t("editor.contentEditing");

  async function handlePublish() {
    if (saveBlockedReason) return;
    setPublicationBusy(true);

    try {
      if (markdownSession.active && !(await markdownSession.flush())) return;
      if (store.getState().dirty) {
        await flushSave();
      }

      const result = await resolvedPublishDocument({ resumeId });

      setPublishedSlug(result.slug);
    } catch (error) {
      if (error instanceof ResumeTrashedClientError) {
        store.getState().setResumeTrashed();
        return;
      }
      toast.error({
        content: t("editor.publishError"),
        key: "editor-publish-error",
      });
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handlePreview() {
    if (previewBusy) return;

    setPreviewBusy(true);

    try {
      if (markdownSession.active && !(await markdownSession.flush())) return;
      if (store.getState().dirty) {
        await flushSave();
      }

      router.push(previewHref);
    } catch {
      // Save state and retry feedback are handled by the persistence layer.
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleRestartOnboarding() {
    setShortcutPanelOpen(false);

    try {
      const result = await restartEditorOnboardingClient();
      router.push(result.editorHref);
    } catch {
      toast.error({
        content: t("onboarding.error.generic"),
        key: "editor-onboarding-restart-error",
      });
    }
  }

  async function handleUnpublish() {
    if (saveBlockedReason) return;
    setPublicationBusy(true);

    try {
      await resolvedUnpublishDocument({ resumeId });
      setPublishedSlug(undefined);
    } catch (error) {
      if (error instanceof ResumeTrashedClientError) store.getState().setResumeTrashed();
      else toast.error({ key: "editor-unpublish-error", content: t("editor.unpublishError") });
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handleExportPdf() {
    if (saveBlockedReason) return;
    setPdfBusy(true);

    try {
      if (markdownSession.active && !(await markdownSession.flush())) return;
      if (store.getState().dirty) {
        await flushSave();
      }

      await resolvedExportPdfDocument({ resumeId });
    } catch (error) {
      if (error instanceof ResumeTrashedClientError) store.getState().setResumeTrashed();
      else toast.error({ key: "editor-pdf-error", content: t("editor.pdfError") });
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
    setAutosaveSnapshot(result.autosave ?? null);
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
    if (saveBlockedReason) return;
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
    } catch (error) {
      setVersionDiffOpen(false);
      if (error instanceof ResumeSnapshotUnavailableClientError) {
        await loadVersionHistory(versionHistoryPage.page).catch(() => setVersionHistoryError(true));
      }
      toast.error({
        content: t(error instanceof ResumeSnapshotUnavailableClientError ? "editor.snapshotExpired" : "editor.diff.historyLoadError"),
        key: "editor-version-diff-error",
      });
    } finally {
      setVersionDiffLoading(false);
    }
  }

  async function handleRestoreVersion(snapshotId: string) {
    if (saveBlockedReason) return;
    setVersionHistoryBusy(true);
    setVersionHistoryError(false);

    try {
      let targetId = snapshotId;
      if (autosaveSnapshot?.id === snapshotId && store.getState().dirty) {
        targetId = (await resolvedCreateVersionSnapshot(resumeId, snapshotId)).id;
      }
      if (store.getState().dirty) {
        await flushSave();
      }

      const restored = await resolvedRestoreVersion({
        resumeId,
        snapshotId: targetId,
        version: store.getState().version,
      });

      store.getState().restoreServerVersion(restored);
      await deleteLocalDraft(resumeId);
      setVersionHistoryOpen(false);
    } catch (error) {
      if (error instanceof ResumeTrashedClientError) store.getState().setResumeTrashed();
      if (error instanceof ResumeSnapshotUnavailableClientError) {
        setVersionDiffOpen(false);
        await loadVersionHistory(1).catch(() => setVersionHistoryError(true));
      }
      if (error instanceof ResumeVersionConflictClientError) {
        store.getState().setSaveConflict({
          currentVersion: error.currentVersion,
        });
      }

      setVersionHistoryError(true);
      toast.error({
        content: t(error instanceof ResumeSnapshotUnavailableClientError ? "editor.snapshotExpired" : "editor.versionHistoryError"),
        key: "editor-version-history-error",
      });
    } finally {
      setVersionHistoryBusy(false);
    }
  }

  async function handleEditSurfaceModeChange(nextMode: EditSurfaceMode) {
    if (nextMode === editSurfaceMode || markdownModeBusy) return;

    if (nextMode === "markdown") {
      setMarkdownModeBusy(true);
      try {
        setTemporaryLayoutMode(false);
        setAiAssistantOpen(false);
        setAiProposalPreview(undefined);
        if (globalThis.document.activeElement instanceof HTMLElement) {
          globalThis.document.activeElement.blur();
        }
        await Promise.resolve();
        await markdownSession.enter();
        store.getState().setSelection({});
        setActiveRibbonTab("home");
        setLastPermanentRibbonTab("home");
        setEditSurfaceMode("markdown");
      } finally {
        setMarkdownModeBusy(false);
      }
      return;
    }

    if (editSurfaceMode === "markdown") {
      setMarkdownModeBusy(true);
      let exited = false;
      try {
        exited = await markdownSession.exit();
      } finally {
        setMarkdownModeBusy(false);
      }
      if (!exited) {
        setPendingMarkdownExitMode(nextMode);
        return;
      }
    }

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

  const selectedContextContent = selectedSectionTitle && selectedSection ? (
    <>
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
              placeholder={getResumeStructuralBlockGap(
                selectedStructuralBlock,
              ).toString()}
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
            placeholder={RESUME_DEFAULT_SECTION_COLUMNS.toString()}
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
            placeholder={RESUME_DEFAULT_BLOCK_GAP_PX.toString()}
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
            placeholder={RESUME_DEFAULT_SECTION_PADDING_PX.toString()}
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
            placeholder={RESUME_DEFAULT_SECTION_PADDING_PX.toString()}
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
            placeholder={RESUME_DEFAULT_SECTION_PADDING_PX.toString()}
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
            placeholder={RESUME_DEFAULT_SECTION_PADDING_PX.toString()}
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
  ) : null;

  const documentDesignContent = (
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
            data-onboarding-anchor="editor-visual-preset"
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

    </>
  );

  const pageMarginContent = (
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
  );

  function renderEditSurfaceModeControls(layoutAnchor = false) {
    return (
      <div className={styles.ribbonCommandStack}>
        <Button
          aria-label={t("editor.contentEditing")}
          aria-pressed={activeEditSurfaceMode === "content"}
          className={styles.ribbonModeButton}
          disabled={markdownModeBusy}
          icon={<FileTextOutlined />}
          onClick={() => void handleEditSurfaceModeChange("content")}
        >
          {t("editor.contentEditing")}
        </Button>
        <Button
          aria-label={t("editor.layoutSorting")}
          aria-pressed={activeEditSurfaceMode === "layout"}
          className={styles.ribbonModeButton}
          data-onboarding-anchor={layoutAnchor ? "editor-reorder-content" : undefined}
          disabled={markdownModeBusy}
          icon={<AppstoreAddOutlined />}
          onClick={() => void handleEditSurfaceModeChange("layout")}
        >
          {t("editor.layoutSorting")}
        </Button>
      </div>
    );
  }

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
      key: "design",
      label: t("editor.ribbon.tab.design"),
      icon: <PropertiesIcon size={15} />,
    },
    {
      key: "layout",
      label: t("editor.ribbon.tab.layout"),
      icon: <LayoutIcon size={15} />,
    },
    ...(contextRibbonKind
      ? [{
          key: "context" as const,
          label: t(`editor.ribbon.tab.context.${contextRibbonKind}`),
        }]
      : []),
  ];

  const quickActions = (
    <>
      <Button
        aria-label={t("editor.undo")}
        className={styles.ribbonIconButton}
        disabled={activeEditSurfaceMode === "markdown" || !canUndo}
        title={t("editor.undoShortcut")}
        type="text"
        onClick={() => store.getState().undo()}
      >
        <UndoIcon size={16} />
      </Button>
      <Button
        aria-label={t("editor.redo")}
        className={styles.ribbonIconButton}
        disabled={activeEditSurfaceMode === "markdown" || !canRedo}
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
      <Dropdown trigger={["hover"]} open={aiMenuOpen} autoFocus={aiMenuKeyboard} onOpenChange={(open) => {
        setAiMenuOpen(open);
        if (!open) setAiMenuKeyboard(false);
      }} menu={{ items: [
        { key: "assistant", label: t("ai.title"), disabled: activeEditSurfaceMode === "markdown" },
        { key: "review", label: t("aiReview.title") },
      ], onClick: ({ key }) => {
        setAiMenuOpen(false);
        setAiMenuKeyboard(false);
        setAiProposalPreview(undefined);
        setAiReviewOpen(key === "review");
        setAiAssistantOpen(key === "assistant");
        if (key === "assistant") setAiSuggestionConversationId(undefined);
      } }}>
        <Button
          aria-label={t("ai.title")}
          className={styles.ribbonLabelButton}
          type="text"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAiMenuKeyboard(true);
              setAiMenuOpen(true);
            }
          }}
          onClick={() => {
            if (activeEditSurfaceMode === "markdown") { setAiAssistantOpen(false); setAiReviewOpen(true); }
            else { setAiReviewOpen(false); setAiAssistantOpen(true); setAiSuggestionConversationId(undefined); }
          }}
        >
          <AiAssistantIcon size={16} />
          <span>AI</span>
        </Button>
      </Dropdown>
      <Tooltip title={t("editor.versionHistory")}>
        <Button
          aria-label={t("editor.versionHistory")}
          className={styles.ribbonIconButton}
          disabled={activeEditSurfaceMode === "markdown"}
          type="text"
          onClick={() => void handleOpenVersionHistory()}
        >
          <HistoryIcon size={16} />
        </Button>
      </Tooltip>
      <Tooltip title={t("editor.shortcuts.open")}>
        <Button
          aria-label={t("editor.shortcuts.open")}
          className={styles.ribbonIconButton}
          type="text"
          onClick={() => setShortcutPanelOpen(true)}
        >
          <KeyboardIcon size={16} />
        </Button>
      </Tooltip>
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
      <LocaleSwitcher />
      <ResumeSummaryEditor
        initialSummary={resumeSummary}
        resumeId={resumeId}
        saveSummary={resolvedUpdateSummary}
        triggerType="default"
        triggerDisabled={activeEditSurfaceMode === "markdown"}
        version={initialVersion}
        prepareSave={async () => {
          if (markdownSession.active && !(await markdownSession.flush())) {
            throw new Error("markdown_invalid");
          }
          await flushSave();
          return store.getState().version;
        }}
        onSaved={(result) => {
          setResumeSummary(result.summary);
          store.getState().syncMetadataVersion(result);
        }}
      />
      <Button
        data-onboarding-anchor="editor-preview"
        disabled={previewBusy}
        href={previewHref}
        loading={previewBusy}
        onClick={(event) => {
          event.preventDefault();
          void handlePreview();
        }}
      >
        {t("common.preview")}
      </Button>
      <div
        className={styles.ribbonControlGroup}
        data-onboarding-anchor="editor-output-actions"
      >
        {publicHref ? (
          <Space.Compact>
            <Button
              data-testid="resume-publish-action"
              disabled={publicationBusy}
              onClick={() => void handleCopyPublicLink()}
            >
              {publicLinkCopied
                ? t("editor.publicLinkCopied")
                : t("editor.copyPublicLink")}
            </Button>
            <Dropdown
              classNames={{ item: styles.publicActionsMenuItem }}
              menu={{
                items: [
                  {
                    key: "open-public",
                    label: (
                      <a
                        data-testid="resume-open-public"
                        href={publicHref}
                      >
                        {t("common.openPublic")}
                      </a>
                    ),
                  },
                  {
                    danger: true,
                    key: "unpublish",
                    label: t("common.unpublish"),
                  },
                ],
                onClick: ({ key }) => {
                  if (key === "unpublish") setUnpublishOpen(true);
                },
              }}
              mouseEnterDelay={0}
              trigger={["hover", "click"]}
            >
              <Button
                aria-label={t("editor.publicActionsMore")}
                disabled={publicationBusy || Boolean(saveBlockedReason)}
                icon={<DownOutlined />}
              />
            </Dropdown>
          </Space.Compact>
        ) : (
          <Button
            data-testid="resume-publish-action"
            disabled={publicationBusy || Boolean(saveBlockedReason)}
            type="primary"
            onClick={() => void handlePublish()}
          >
            {t("common.publish")}
          </Button>
        )}
        <Tooltip title={t("editor.publicAppearanceHelp")}>
          <Button
            aria-label={t("editor.publicAppearanceHelp")}
            className={styles.ribbonIconButton}
            href="/docs/public-resume-customization"
            rel="noreferrer"
            target="_blank"
            type="text"
          >
            <HelpIcon size={16} />
          </Button>
        </Tooltip>
        <Space.Compact>
          <Button
            disabled={pdfBusy || Boolean(saveBlockedReason)}
            loading={pdfBusy}
            type="primary"
            onClick={() => void handleExportPdf()}
          >
            {t("common.export")}
          </Button>
          <Dropdown
            classNames={{ item: styles.publicActionsMenuItem }}
            menu={{
              items: [{ key: "pdf", label: t("common.pdf") }],
              onClick: ({ key }) => {
                if (key === "pdf") void handleExportPdf();
              },
            }}
            mouseEnterDelay={0}
            trigger={["hover", "click"]}
          >
            <Button
              aria-label={t("editor.exportFormats")}
              disabled={pdfBusy || Boolean(saveBlockedReason)}
              icon={<DownOutlined />}
              type="primary"
            />
          </Dropdown>
        </Space.Compact>
      </div>
    </>
  );

  const ribbonCommandGroups: EditorRibbonGroup[] = (() => {
    switch (effectiveRibbonTab) {
      case "home":
        return [
          {
            key: "mode",
            label: t("editor.ribbon.group.mode"),
            content: renderEditSurfaceModeControls(),
          },
          {
            key: "text",
            label: t("editor.ribbon.group.text"),
            content: (
              <div className={styles.ribbonCommandStack}>
                <div className={styles.ribbonCommandRow}>
                  {([
                    ["bold", "toggleBold", "editor.bold", "editor.boldShortcut", BoldOutlined],
                    ["italic", "toggleItalic", "editor.italic", "editor.italicShortcut", ItalicOutlined],
                    ["underline", "toggleUnderline", "editor.underline", "editor.underlineShortcut", UnderlineOutlined],
                    ["strike", "toggleStrike", "editor.strike", "editor.strikeShortcut", StrikethroughOutlined],
                    ["tag", "toggleTag", "editor.inlineTag", "editor.inlineTagShortcut", TagOutlined],
                  ] as const).map(([state, command, label, shortcut, Icon]) => (
                    <Tooltip key={state} title={t(shortcut)}>
                      <Button
                        aria-label={t(label)}
                        aria-pressed={resolvedFormattingState[state]}
                        className={styles.ribbonFormatButton}
                        data-onboarding-anchor={
                          state === "bold" ? "editor-format-bold" : undefined
                        }
                        disabled={textToolsDisabled}
                        onMouseDown={preventToolbarMouseDown}
                        onClick={() => runTextEditorCommand({ type: command })}
                      >
                        <Icon />
                      </Button>
                    </Tooltip>
                  ))}
                </div>
                <div className={styles.ribbonCommandRow}>
                  <PaletteColorPicker
                    allowClear={Boolean(
                      selectedSectionTitle || selectedTextBlock,
                    )}
                    className={styles.ribbonColorControl}
                    disabled={textToolsDisabled}
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
                        : selectedTextBlock?.style?.tone === "muted"
                          ? document.settings.theme.mutedColor
                          : selectedTextBlock?.style?.tone === "accent"
                            ? document.settings.theme.accent
                            : document.settings.theme.textColor
                    }
                    onChange={(color) =>
                      selectedSectionTitle
                        ? setSelectedSectionTitleColor(color)
                        : setSelectedTextBlockColor(color)
                    }
                    onClear={() =>
                      selectedSectionTitle
                        ? setSelectedSectionTitleColor(undefined)
                        : setSelectedTextBlockColor(undefined)
                    }
                  />
                  <Button
                    aria-label={t("editor.iconLibrary.open")}
                    className={styles.ribbonSmallCommand}
                    disabled={textToolsDisabled}
                    icon={<AppstoreAddOutlined />}
                    onMouseDown={preventToolbarMouseDown}
                    onClick={() => setIconPickerOpen(true)}
                  >
                    {t("editor.iconLibrary.open")}
                  </Button>
                </div>
              </div>
            ),
          },
          ...(!textToolsDisabled && (selectedTextBlock || selectedSectionTitle)
            ? [{
                key: "block-format",
                label: selectedSectionTitle
                  ? t("editor.ribbon.property.sectionTitleStyle")
                  : t("editor.ribbon.property.textStyle"),
                content: (
                  <div className={styles.ribbonCommandStack}>
                    <div className={styles.ribbonCommandRow}>
                      <div className={styles.inspectorControlRow} data-field-size="compact">
                        <span className={styles.inspectorControlLabel}>
                          {selectedSectionTitle ? t("editor.sectionTitleFontSize") : t("editor.fontSize")}
                        </span>
                        <DraftInput
                          aria-label={selectedSectionTitle ? t("editor.sectionTitleFontSize") : t("editor.fontSize")}
                          min={selectedSectionTitle ? 8 : undefined}
                          max={selectedSectionTitle ? 72 : undefined}
                          placeholder={(selectedSectionTitle
                            ? RESUME_DEFAULT_SECTION_TITLE_FONT_SIZE_PX
                            : document.settings.typography.baseFontSize
                          ).toString()}
                          type="number"
                          value={selectedSectionTitle
                            ? selectedSection?.titleStyle?.fontSize?.toString() ?? ""
                            : selectedTextBlock?.style?.fontSize?.toString() ?? ""}
                          parseValue={parsePositiveNumber}
                          onValidValueChange={(fontSize) => selectedSectionTitle
                            ? setSelectedSectionTitleFontSize(fontSize)
                            : updateSelectedTextBlockStyle({ fontSize })}
                        />
                      </div>
                      {selectedSectionTitle ? (
                        <Button
                          className={styles.ribbonSmallCommand}
                          disabled={!selectedSection?.titleStyle?.fontSize}
                          onClick={() => setSelectedSectionTitleFontSize(undefined)}
                        >
                          {t("editor.restoreDefaultTitleSize")}
                        </Button>
                      ) : (
                        <>
                          <div className={styles.inspectorControlRow} data-field-size="compact">
                            <span className={styles.inspectorControlLabel}>{t("editor.fontWeight")}</span>
                            <DraftInput
                              aria-label={t("editor.fontWeight")}
                              placeholder={RESUME_DEFAULT_TEXT_FONT_WEIGHT.toString()}
                              type="number"
                              value={selectedTextBlock?.style?.fontWeight?.toString() ?? ""}
                              parseValue={parsePositiveNumber}
                              onValidValueChange={(fontWeight) => updateSelectedTextBlockStyle({ fontWeight })}
                            />
                          </div>
                          <div className={styles.inspectorControlRow} data-field-size="compact">
                            <span className={styles.inspectorControlLabel}>{t("editor.lineHeight")}</span>
                            <DraftInput
                              aria-label={t("editor.lineHeight")}
                              inputMode="decimal"
                              placeholder={document.settings.typography.lineHeight.toString()}
                              value={selectedTextBlock?.style?.lineHeight?.toString() ?? ""}
                              parseValue={parseCommittedPositiveDecimal}
                              onValidValueChange={(lineHeight) => updateSelectedTextBlockStyle({ lineHeight })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    {selectedTextBlock ? (
                      <div className={styles.ribbonCommandRow}>
                        {([
                          ["left", AlignLeftOutlined, "editor.alignLeft"],
                          ["center", AlignCenterOutlined, "editor.alignCenter"],
                          ["right", AlignRightOutlined, "editor.alignRight"],
                        ] as const).map(([align, Icon, label]) => (
                          <Tooltip key={align} title={t(label)}>
                            <Button
                              aria-label={t(label)}
                              aria-pressed={selectedTextBlock.style?.align === align}
                              className={styles.ribbonFormatButton}
                              icon={<Icon />}
                              onMouseDown={preventToolbarMouseDown}
                              onClick={() => updateSelectedTextBlockStyle({ align })}
                            />
                          </Tooltip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ),
              }]
            : []),
        ];
      case "insert":
        return [
          {
            key: "section",
            label: t("editor.ribbon.group.section"),
            content: (
              <div className={styles.ribbonControlGroup}>
                <Button
                  aria-label={t("editor.addBlankSection")}
                  className={styles.ribbonLargeButton}
                  data-ribbon-control="large"
                  icon={<FileAddOutlined />}
                  onClick={() => store.getState().addSection()}
                >
                  {t("editor.addBlankSection")}
                </Button>
                <SectionPresetCommands
                  className={styles.ribbonLargeButton}
                  locale={locale}
                  presets={quickInsertPresets}
                  settings={document.settings}
                  onInsert={(presetId) => store.getState().addSection(presetId)}
                />
              </div>
            ),
          },
          {
            key: "content",
            label: t("editor.ribbon.group.content"),
            content: (
              <div
                className={styles.ribbonPresetGrid}
                data-onboarding-anchor="editor-insert-content"
              >
                {listBlockPresets(locale).map((preset) => (
                  <Button
                    aria-label={t(preset.labelKey)}
                    className={styles.ribbonSmallCommand}
                    disabled={activeEditSurfaceMode !== "content" || !selectedSection}
                    icon={<PlusSquareOutlined />}
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
          {
            key: "link",
            label: t("editor.ribbon.group.link"),
            content: (
              <Button
                aria-label={t("editor.link")}
                className={styles.ribbonLargeButton}
                data-ribbon-control="large"
                disabled={textToolsDisabled}
                icon={<LinkOutlined />}
                onMouseDown={preventToolbarMouseDown}
                onClick={openLinkDialog}
              >
                {t("editor.link")}
              </Button>
            ),
          },
        ];
      case "design":
        return [{
          key: "document-design",
          label: t("editor.ribbon.tab.design"),
          content: documentDesignContent,
          embedded: true,
        }];
      case "layout":
        return [
          {
            key: "reorder",
            label: t("editor.ribbon.group.mode"),
            content: renderEditSurfaceModeControls(true),
          },
          {
            key: "page",
            label: t("editor.ribbon.group.page"),
            content: (
              <div className={styles.ribbonCommandStack}>
                <Tooltip title={t("editor.printSafeAreaTooltip")}>
                  <Button
                    aria-label={t("editor.printSafeArea")}
                    aria-pressed={showPrintSafeArea}
                    className={styles.ribbonModeButton}
                    icon={<FileTextOutlined />}
                    onClick={() => setShowPrintSafeArea((current) => !current)}
                  >
                    {t("editor.printSafeArea")}
                  </Button>
                </Tooltip>
                <Tooltip title={t("editor.refreshPaginationTooltip")}>
                  <Button
                    aria-label={t("editor.refreshPagination")}
                    className={styles.ribbonModeButton}
                    icon={<ReloadOutlined />}
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
          {
            key: "margins",
            label: t("editor.ribbon.property.margins"),
            content: pageMarginContent,
            embedded: true,
          },
        ];
      case "context":
        return selectedContextContent && contextRibbonKind
          ? [{
              key: "selection",
              label: t(`editor.ribbon.tab.context.${contextRibbonKind}`),
              content: selectedContextContent,
              embedded: true,
            }]
          : [];
    }
  })();

  return (
    <div className={styles.editorWorkspace}>
      <AppRouteLoadingHold active={!initialPaginationReady || previewBusy} />
      <main className={styles.shell} data-testid="resume-editor-shell">
      <EditorRibbon
        activeTab={effectiveRibbonTab}
        backHref="/app"
        backLabel={t("common.back")}
        commandGroups={ribbonCommandGroups}
        disabled={activeEditSurfaceMode === "markdown"}
        documentActions={documentActions}
        documentName={resumeName}
        documentNameLabel={t("editor.resumeTitle")}
        quickActions={quickActions}
        saveStatus={
          activeEditSurfaceMode === "markdown" && markdownSession.isPreviewStale
            ? t("editor.markdown.saveBlocked")
            : formatSaveStatus(saveStatus, t)
        }
        saveStatusTone={
          activeEditSurfaceMode === "markdown" && markdownSession.isPreviewStale
            ? "error"
            : saveStatus === "dirty"
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
        onTabChange={selectRibbonTab}
      />

      {linkDialogDraft ? (
        <ResumeLinkDialog
          initial={linkDialogDraft}
          themeColor={document.settings.theme.accent}
          sections={document.sections
            .filter((section) => section.visible)
            .map((section) => ({
              id: section.id,
              title: section.title
                ? getPlainTextFromRichText(section.title)
                : t("editor.unknown"),
            }))}
          onApply={(draft) => {
            const applied = runTextEditorCommand({
              type: "upsertLink",
              text: draft.text,
              href: draft.href,
              title: draft.title,
              color: draft.color,
              underline: draft.underline,
            });

            if (applied) setLinkDialogDraft(undefined);

            return Boolean(applied);
          }}
          onCancel={() => setLinkDialogDraft(undefined)}
          onRemove={() => {
            runTextEditorCommand({ type: "unsetLink" });
            setLinkDialogDraft(undefined);
          }}
        />
      ) : null}

      <EditorShortcutPanel
        open={shortcutPanelOpen}
        onCancel={() => setShortcutPanelOpen(false)}
        onRestartOnboarding={() => void handleRestartOnboarding()}
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
            disabled={versionHistoryBusy || Boolean(saveBlockedReason)}
            loading={versionHistoryBusy}
            type="primary"
            onClick={() => void handleCreateVersionSnapshot()}
          >
            {t("editor.createVersionSnapshot")}
          </Button>
          <div className={styles.versionHistoryList}>
            {[...(autosaveSnapshot ? [autosaveSnapshot] : []), ...versionSnapshots].map((snapshot) => (
              <div className={styles.versionHistoryItem} key={snapshot.id}>
                <div className={styles.versionHistoryMeta}>
                  <div className={styles.versionHistoryHeading}>
                    <strong>{t("editor.versionLabel", { version: snapshot.version })}</strong>
                    {snapshot.id === autosaveSnapshot?.id ? (
                      <Tag>{t("editor.autosaveSnapshot")}</Tag>
                    ) : null}
                  </div>
                  <span className={styles.versionHistoryTimestamp}>
                    {formatVersionTimestamp(snapshot.createdAt, locale)}
                  </span>
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
                    <Button disabled={versionHistoryBusy || Boolean(saveBlockedReason)}>
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
          {!versionHistoryBusy && !versionHistoryError && !autosaveSnapshot && versionSnapshots.length === 0 ? (
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

      <ActionConfirmationModal
        cancelText={t("editor.markdown.continueEditing")}
        confirmText={t("editor.markdown.discard")}
        description={t("editor.markdown.discardDescription")}
        open={pendingMarkdownExitMode !== undefined}
        pending={markdownModeBusy}
        title={t("editor.markdown.discardTitle")}
        onCancel={() => setPendingMarkdownExitMode(undefined)}
        onConfirm={() => {
          const nextMode = pendingMarkdownExitMode;
          if (!nextMode) return;
          setMarkdownModeBusy(true);
          void markdownSession.discard()
            .then(() => {
              setEditSurfaceMode(nextMode);
              setPendingMarkdownExitMode(undefined);
            })
            .finally(() => setMarkdownModeBusy(false));
        }}
      />

      <ActionConfirmationModal
        cancelText={t("editor.markdown.recoveryDiscard")}
        confirmText={t("editor.markdown.recoveryUse")}
        danger={false}
        description={t(
          markdownSession.recoveryIsStale
            ? "editor.markdown.recoveryStaleDescription"
            : "editor.markdown.recoveryDescription",
        )}
        open={
          activeEditSurfaceMode === "markdown" &&
          markdownSession.recoveryDraft !== undefined
        }
        title={t("editor.markdown.recoveryTitle")}
        onCancel={() => void markdownSession.dismissRecovery()}
        onConfirm={() => markdownSession.recoverDraft()}
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
                await deleteLocalDraft(resumeId);
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
                await deleteLocalDraft(resumeId);
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

      <section
        className={styles.body}
        data-workspace-view={
          activeEditSurfaceMode === "markdown" ? "markdown" : "outline"
        }
        data-testid="editor-workspace-body"
        ref={workspaceBodyRef}
        style={workspaceStyle}
      >
        <EditorWorkspaceSidebar
          activeView={
            activeEditSurfaceMode === "markdown" ? "markdown" : "outline"
          }
          busy={markdownModeBusy}
          helpLabel={t("editor.markdown.help")}
          markdownLabel={t("editor.markdownEditing")}
          navigationLabel={t("editor.workspaceNavigation")}
          outlineLabel={t("editor.outline")}
          resizeHandle={
            <EditorWorkspaceResizeHandle
              label={t("editor.workspaceResize")}
              max={OUTLINE_PANEL_MAX_WIDTH}
              min={WORKSPACE_PANEL_MIN_WIDTH}
              value={outlinePanelWidth}
              onChange={setOutlinePanelWidth}
            />
          }
          onSelectMarkdown={() => void handleEditSurfaceModeChange("markdown")}
          onSelectOutline={() => void handleEditSurfaceModeChange("content")}
        >
          {activeEditSurfaceMode !== "markdown" ? (
            <SectionOutline
              sections={document.sections}
              selectedSectionId={selection.sectionId}
              onSelectSection={handleOutlineSectionSelection}
              onRenameSection={({ sectionId, title }) =>
                store.getState().setSectionTitle({
                  sectionId,
                  title: title ? createRichTextFromPlainText(title) : undefined,
                })
              }
              onMoveSection={(params) => store.getState().moveSection(params)}
              classNames={{
                outlineList: styles.outlineList,
                outlineItem: styles.outlineItem,
                outlineTitleArea: styles.outlineTitleArea,
                outlineButton: styles.outlineButton,
                outlineTitleText: styles.outlineTitleText,
                outlineMeta: styles.outlineMeta,
                outlineEditButton: styles.outlineEditButton,
                outlineDragHandle: styles.outlineDragHandle,
                outlineTitleInput: styles.outlineTitleInput,
                compactActionRow: styles.compactActionRow,
                outlineOrderButton: styles.outlineOrderButton,
              }}
            />
          ) : null}
        </EditorWorkspaceSidebar>

        {activeEditSurfaceMode === "markdown" ? (
          <MarkdownEditingWorkspace
            diagnostics={markdownSession.diagnostics}
            getDiagnosticMessage={(diagnostic) =>
              getResumeMarkdownDiagnosticMessage(t, diagnostic)
            }
            isPreviewStale={markdownSession.isPreviewStale}
            labels={{
              diagnostics: t("editor.markdown.diagnostics"),
              emptyDiagnostics: t("editor.markdown.noDiagnostics"),
              error: t("editor.markdown.error"),
              line: t("editor.markdown.line"),
              preview: t("editor.markdown.preview"),
              source: t("editor.markdown.source"),
              stalePreview: t("editor.markdown.stalePreview"),
              warning: t("editor.markdown.warning"),
            }}
            resizeHandle={
              <EditorWorkspaceResizeHandle
                label={t("editor.workspaceResize")}
                max={markdownPanelMaxWidth}
                min={WORKSPACE_PANEL_MIN_WIDTH}
                value={Math.min(markdownPanelWidth, markdownPanelMaxWidth)}
                onChange={setMarkdownPanelWidth}
              />
            }
            source={markdownSession.source}
            onSourceChange={markdownSession.setSource}
          />
        ) : null}

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
              {aiProposalPreview ? (
                <>
                  <Tag
                    className={styles.canvasModeTag}
                    color="processing"
                    variant="filled"
                  >
                    {t("ai.proposal.previewMode")}
                  </Tag>
                  <Segmented
                    aria-label={t("ai.proposal.previewMode")}
                    options={[
                      {
                        label: t("ai.proposal.previewOriginal"),
                        value: "original",
                      },
                      {
                        label: t("ai.proposal.previewEffect"),
                        value: "effect",
                      },
                    ]}
                    size="small"
                    value={aiPreviewMode}
                    onChange={(value) =>
                      setAiPreviewMode(value as "original" | "effect")
                    }
                  />
                  <Button
                    size="small"
                    onClick={() => setAiProposalPreview(undefined)}
                  >
                    {t("ai.proposal.exitPreview")}
                  </Button>
                </>
              ) : (
                <Tag
                  className={styles.canvasModeTag}
                  color="geekblue"
                  variant="filled"
                >
                  {editSurfaceModeLabel}
                </Tag>
              )}
            </div>
          </div>
          <div
            ref={canvasViewportRef}
            className={styles.canvasViewport}
            data-onboarding-anchor="editor-canvas"
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                !event.target.closest("[data-resume-section-id]")
              ) {
                store.getState().setSelection({});
              }
            }}
            onScroll={handleCanvasViewportScroll}
          >
            <div
              className={styles.canvasZoom}
              data-read-only={activeEditSurfaceMode === "markdown"}
              data-testid="resume-canvas-zoom"
              inert={activeEditSurfaceMode === "markdown" || undefined}
              style={{ transform: `scale(${zoom})` }}
            >
              {activeEditSurfaceMode === "markdown" || aiProposalPreview ? (
                <ResumeRenderer
                  document={
                    activeEditSurfaceMode === "markdown"
                      ? markdownSession.previewDocument
                      : canvasDocument
                  }
                  mode={
                    activeEditSurfaceMode === "markdown" ? "edit" : "view"
                  }
                  paginationRevision={paginationRevision}
                  showPrintSafeArea={showPrintSafeArea}
                  zoom={zoom}
                  onPageCountChange={handlePageCountChange}
                  onPaginationReadyChange={handlePaginationReadyChange}
                />
              ) : (
                <ResumeLinkDialogContext.Provider value={setLinkDialogDraft}>
                  <ResumeRenderer
                    document={canvasDocument}
                    mode="edit"
                    editSurfaceMode={activeEditSurfaceMode}
                    paginationRevision={paginationRevision}
                    showPrintSafeArea={showPrintSafeArea}
                    zoom={zoom}
                    selection={selection}
                    onSelectBlock={(nextSelection) =>
                      store.getState().setSelection(nextSelection)
                    }
                    onChangeSectionTitle={(params) =>
                      store.getState().updateSectionTitle(params)
                    }
                    onChangeTextBlock={(params) => {
                      if (params.commit) {
                        store.getState().commitTextBlock(params);
                        return;
                      }

                      store.getState().updateTextBlockContent(params);
                    }}
                    onCommitBadgeItem={commitBadgeItem}
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
                    onPaginationReadyChange={handlePaginationReadyChange}
                  />
                </ResumeLinkDialogContext.Provider>
              )}
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
      {onboardingRun ? (
        <ResumeOnboardingController
          document={document}
          run={onboardingRun}
          saveStatus={saveStatus}
          onSelectRibbonTab={selectRibbonTab}
        />
      ) : null}
      <AiAssistantPanel
        open={aiAssistantOpen}
        initialConversationId={aiSuggestionConversationId}
        resumeId={resumeId}
        resumeVersion={version}
        sectionId={selection.sectionId}
        onApplyProposal={async (input) => {
          const current = store.getState();
          const result = applySelectedAiChanges({
            document: current.document,
            currentVersion: current.version,
            ...input,
          });
          if (result.ok) {
            await flushSave();
          }
          return result;
        }}
        onProposalPersisted={(persisted) => {
          store.getState().updateDocument(() => persisted.document);
          store.getState().markSaved({
            ...persisted,
            document: persisted.document,
          });
          setAiProposalPreview(undefined);
        }}
        onClose={() => {
          setAiAssistantOpen(false);
          setAiProposalPreview(undefined);
        }}
        onPreviewProposal={previewAiProposal}
      />
      {aiReviewOpen ? <AiReviewPanel
        key={resumeId}
        resumeId={resumeId}
        resumeVersion={version}
        onClose={() => setAiReviewOpen(false)}
        onEnsureSaved={async () => {
          if (markdownSession.active && !(await markdownSession.flush())) return null;
          for (let attempt = 0; attempt < 3 && store.getState().dirty; attempt += 1) await flushSave();
          return store.getState().dirty ? null : { resumeVersion: store.getState().version };
        }}
        onLocate={(target) => {
          const elements = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-resume-section-id]"));
          const section = elements.find((element) => element.dataset.resumeSectionId === target.sectionId);
          const block = section && Array.from(section.querySelectorAll<HTMLElement>("[data-resume-block-path]")).find((element) => element.dataset.resumeBlockPath === target.blockPath.join("::"));
          (block ?? section)?.scrollIntoView({ block: "center", behavior: "smooth" });
          if ((block || (!target.blockPath.length && section)) && !markdownSession.active) store.getState().setSelection({ sectionId: target.sectionId, ...(target.blockPath.length ? { blockPath: target.blockPath } : {}) });
        }}
        onOpenSuggestions={async (conversationId) => {
          if (markdownSession.active) {
            if (!(await markdownSession.exit())) return false;
            setEditSurfaceMode("content");
            await flushSave();
          }
          setAiSuggestionConversationId(conversationId);
          setAiReviewOpen(false);
          setAiAssistantOpen(true);
          return true;
        }}
      /> : null}
    </div>
  );
}
