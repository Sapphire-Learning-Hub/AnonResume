"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Spin,
} from "antd";

import type { AiResumeProposal } from "@/domain/resume/ai/proposal-apply";
import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import {
  AiClientError,
  markAiProposalApplied,
  type AiStoredProposal,
} from "@/lib/ai/client";
import { getAiProposalStreamProgress } from "@/lib/ai/proposals/stream-progress";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { CloseIcon } from "@/components/ui/InlineIcons";
import { useI18n } from "@/i18n/I18nProvider";
import type { AiRunProgressStage } from "@/lib/ai/runs/stream-events";

import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";
import { AiMarkdownMessage } from "./AiMarkdownMessage";
import { AiPlainText } from "./AiPlainText";
import { AiProposalCard, AiProposalProgressCard } from "./AiProposalCard";
import { useAiConversation } from "./useAiConversation";

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 360;
const MAX_PANEL_WIDTH = 720;
const MIN_EDITOR_WIDTH = 640;
const KEYBOARD_RESIZE_STEP = 24;

function getMaximumPanelWidth() {
  if (typeof window === "undefined") return MAX_PANEL_WIDTH;
  return Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, window.innerWidth - MIN_EDITOR_WIDTH),
  );
}

function clampPanelWidth(width: number) {
  return Math.min(Math.max(width, MIN_PANEL_WIDTH), getMaximumPanelWidth());
}

export function AiAssistantPanel({
  open,
  resumeId,
  resumeVersion,
  sectionId,
  onClose,
  onApplyProposal,
  onPreviewProposal,
}: {
  open: boolean;
  resumeId: string;
  resumeVersion: number;
  sectionId?: string;
  onClose: () => void;
  onApplyProposal: (input: {
    proposal: AiResumeProposal;
    baseResumeVersion: number;
    selectedChangeIds: string[];
  }) =>
    | ReturnType<
        typeof import("@/domain/resume/ai/proposal-apply").applySelectedAiChanges
      >
    | Promise<
        ReturnType<
          typeof import("@/domain/resume/ai/proposal-apply").applySelectedAiChanges
        >
      >;
  onPreviewProposal?: (input: {
    proposal: AiResumeProposal;
    baseResumeVersion: number;
    selectedChangeIds: string[];
  }) => boolean;
}) {
  const { styles } = useAiAssistantPanelStyles();
  const { t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const [draft, setDraft] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const resizeStateRef = useRef<
    | {
        pointerId: number;
        startWidth: number;
        startX: number;
      }
    | undefined
  >(undefined);

  function reportError(error: unknown) {
    const code =
      error instanceof AiClientError ? error.code : "ai_request_failed";
    notification.error({
      key: "ai-assistant-error",
      title: t("ai.error.title"),
      description: t(
        code === "ai_quota_exceeded"
          ? "ai.error.quota"
          : code === "ai_resume_version_conflict"
            ? "ai.error.versionConflict"
            : code === "ai_run_already_active"
              ? "ai.error.activeRun"
              : "ai.error.generic",
      ),
      duration: false,
    });
  }

  const assistant = useAiConversation({
    open,
    resumeId,
    resumeVersion,
    sectionId,
    onError: reportError,
  });

  useEffect(() => {
    if (!open) return;

    const constrainPanelWidth = () => {
      setPanelWidth((current) => clampPanelWidth(current));
    };

    constrainPanelWidth();
    window.addEventListener("resize", constrainPanelWidth);
    return () => window.removeEventListener("resize", constrainPanelWidth);
  }, [open]);

  async function handleApply(
    storedProposal: AiStoredProposal,
    selectedChangeIds: string[],
  ) {
    const parsed = aiResumeProposalSchema.safeParse(storedProposal.proposal);
    if (!parsed.success) return false;
    try {
      const result = await onApplyProposal({
        proposal: parsed.data,
        baseResumeVersion: storedProposal.baseResumeVersion,
        selectedChangeIds,
      });
      if (!result.ok) {
        toast.error({
          key: "ai-proposal-conflict",
          content: t("ai.proposal.conflict"),
        });
        return false;
      }
      await markAiProposalApplied({
        proposalId: storedProposal.id,
        selectedChangeIds,
      });
      await assistant.refresh();
      toast.success({
        key: "ai-proposal-applied",
        content: t("ai.proposal.applySuccess"),
      });
      return true;
    } catch (error) {
      reportError(error);
      return false;
    }
  }

  async function submitDraft() {
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    try {
      await assistant.send(message);
    } catch (error) {
      setDraft(message);
      reportError(error);
    }
  }

  async function stopCurrentTurn() {
    try {
      const restoredMessage = await assistant.stop();
      if (restoredMessage) setDraft(restoredMessage);
    } catch (error) {
      reportError(error);
    }
  }

  async function editTurn(runId: string) {
    try {
      const restoredMessage = await assistant.edit(runId);
      setDraft(restoredMessage);
    } catch (error) {
      reportError(error);
    }
  }

  const messages = assistant.details?.messages ?? [];
  const proposals = assistant.details?.proposals ?? [];
  const activeProposalCheckpoint = assistant.details?.activeRun?.proposal;
  const proposalStreamText =
    assistant.streamingProposalText ||
    (typeof activeProposalCheckpoint === "string"
      ? activeProposalCheckpoint
      : "");
  const proposalStreamProgress =
    getAiProposalStreamProgress(proposalStreamText);
  const progressStages = assistant.streamingProgressStages.length
    ? assistant.streamingProgressStages
    : (assistant.details?.activeRun?.progress ??
      (assistant.sending ? (["analyzing_resume"] as const) : []));
  const progressLabels: Record<AiRunProgressStage, string> = {
    analyzing_resume: t("ai.analyzing"),
    thinking: t("ai.deepThinking"),
    drafting_response: t("ai.progress.drafting"),
    generating_changes: t("ai.proposal.generating"),
    validating_result: t("ai.progress.validating"),
    repairing_changes: t("ai.progress.repairing"),
    revalidating_result: t("ai.progress.revalidating"),
    saving_result: t("ai.progress.saving"),
  };
  const currentProgressStage = progressStages.at(-1);

  function renderProgressTrace() {
    if (progressStages.length === 0) return null;
    return (
      <ol aria-live="polite" className={styles.executionTrace}>
        {progressStages.map((stage) => (
          <li data-current={stage === currentProgressStage} key={stage}>
            {stage === currentProgressStage ? <Spin size="small" /> : <i />}
            <span>{progressLabels[stage]}</span>
          </li>
        ))}
      </ol>
    );
  }
  const persistedPendingUser = assistant.pendingUserMessage
    ? messages.find(
        (message) =>
          message.sequence > assistant.pendingAfterSequence &&
          message.role === "user",
      )
    : undefined;
  const hasPersistedPendingTurn = Boolean(
    persistedPendingUser &&
    messages.some(
      (message) =>
        message.sequence > persistedPendingUser.sequence &&
        message.role === "assistant",
    ),
  );
  const hasStreamingAssistant = messages.some(
    (message) =>
      message.role === "assistant" && message.completionState === "streaming",
  );
  const currentConversation = assistant.conversations.find(
    (conversation) => conversation.id === assistant.selectedConversationId,
  );

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startWidth: panelWidth,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    setPanelWidth(
      clampPanelWidth(
        resizeState.startWidth + resizeState.startX - event.clientX,
      ),
    );
  }

  function handleResizeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeStateRef.current?.pointerId !== event.pointerId) return;
    resizeStateRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setPanelWidth((current) =>
      clampPanelWidth(
        current +
          (event.key === "ArrowLeft"
            ? KEYBOARD_RESIZE_STEP
            : -KEYBOARD_RESIZE_STEP),
      ),
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-label={t("ai.title")}
      className={styles.panel}
      style={{ width: panelWidth }}
    >
      <div
        aria-label={t("ai.resize")}
        aria-orientation="vertical"
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuenow={panelWidth}
        className={styles.resizeHandle}
        role="separator"
        tabIndex={0}
        onDoubleClick={() => setPanelWidth(DEFAULT_PANEL_WIDTH)}
        onKeyDown={handleResizeKeyDown}
        onPointerCancel={handleResizeEnd}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleMark}>AI</span>
          <strong>{t("ai.title")}</strong>
        </div>
        <Button
          aria-label={t("common.dismiss")}
          className={styles.closeButton}
          type="text"
          onClick={onClose}
        >
          <CloseIcon size={17} />
        </Button>
      </header>
      <div className={styles.body}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarRow}>
            <Select
              allowClear
              aria-label={t("ai.conversation.select")}
              className={styles.conversationSelect}
              options={assistant.conversations.map((conversation) => ({
                value: conversation.id,
                label: conversation.title,
              }))}
              placeholder={t("ai.conversation.new")}
              value={assistant.selectedConversationId}
              onChange={assistant.setSelectedConversationId}
            />
            <Button
              className={styles.newConversationButton}
              onClick={assistant.startNewConversation}
            >
              {t("ai.conversation.new")}
            </Button>
          </div>
          {currentConversation ? (
            <div className={styles.toolbarRow}>
              <Button
                size="small"
                type="text"
                onClick={() => {
                  setRenameValue(currentConversation.title);
                  setRenameOpen(true);
                }}
              >
                {t("ai.conversation.rename")}
              </Button>
              <Popconfirm
                title={t("ai.conversation.archiveConfirm")}
                onConfirm={() => void assistant.archive().catch(reportError)}
              >
                <Button size="small" type="text">
                  {t("ai.conversation.archive")}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={t("ai.conversation.deleteConfirm")}
                onConfirm={() => void assistant.remove().catch(reportError)}
              >
                <Button danger size="small" type="text">
                  {t("common.delete")}
                </Button>
              </Popconfirm>
            </div>
          ) : (
            <div className={styles.setup}>
              <Select
                aria-label={t("ai.model")}
                options={assistant.models.map((model) => ({
                  value: model.id,
                  label: `${model.displayName} · ${model.providerName} · ${
                    model.keySource === "platform"
                      ? t("ai.model.platform")
                      : t("ai.model.personal")
                  }`,
                }))}
                placeholder={t("ai.model.select")}
                value={assistant.selectedModelId}
                onChange={assistant.setSelectedModelId}
              />
              <Segmented
                block
                disabled={!sectionId}
                options={[
                  { label: t("ai.context.resume"), value: "resume" },
                  { label: t("ai.context.section"), value: "section" },
                ]}
                value={assistant.contextScope}
                onChange={(value) =>
                  assistant.setContextScope(value as "resume" | "section")
                }
              />
            </div>
          )}
        </div>

        <div className={styles.messages}>
          {assistant.loading ? (
            <div className={styles.empty}>
              <Spin />
            </div>
          ) : messages.length === 0 &&
            !assistant.pendingUserMessage &&
            !assistant.streamingText &&
            progressStages.length === 0 &&
            proposals.length === 0 &&
            !proposalStreamText ? (
            <Empty
              description={
                assistant.enabled ? t("ai.empty") : t("ai.unavailable")
              }
            />
          ) : (
            <>
              {messages.map((message, index) => {
                if (
                  message.role === "assistant" &&
                  message.completionState !== "streaming" &&
                  !message.text
                ) {
                  return null;
                }
                const liveMessageText =
                  assistant.streamingText ||
                  message.text ||
                  assistant.details?.activeRun?.text;
                const isStreamingAssistant =
                  message.role === "assistant" &&
                  message.completionState === "streaming";
                return (
                  <div
                    className={styles.message}
                    data-role={message.role}
                    key={message.id}
                  >
                    <span className={styles.messageRole}>
                      {message.role === "user"
                        ? t("ai.you")
                        : t("ai.assistant")}
                    </span>
                    {isStreamingAssistant ? renderProgressTrace() : null}
                    {liveMessageText || !isStreamingAssistant ? (
                      <div className={styles.messageContent}>
                        {message.role === "assistant" ? (
                          <AiMarkdownMessage>
                            {(isStreamingAssistant
                              ? liveMessageText
                              : message.text) || t("ai.thinking")}
                          </AiMarkdownMessage>
                        ) : (
                          message.text
                        )}
                      </div>
                    ) : null}
                    {message.role === "user" &&
                    index === messages.length - 2 &&
                    messages[index + 1]?.role === "assistant" &&
                    messages[index + 1]?.completionState === "stopped" &&
                    messages[index + 1]?.runId ? (
                      <Button
                        className={styles.messageAction}
                        disabled={assistant.stopping}
                        size="small"
                        type="text"
                        onClick={() =>
                          void editTurn(messages[index + 1]!.runId!)
                        }
                      >
                        {t("ai.message.edit")}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {assistant.pendingUserMessage && !hasPersistedPendingTurn ? (
                <div className={styles.message} data-role="user">
                  <span className={styles.messageRole}>{t("ai.you")}</span>
                  <span>{assistant.pendingUserMessage}</span>
                </div>
              ) : null}
              {!hasPersistedPendingTurn &&
              !hasStreamingAssistant &&
              assistant.streamingText ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>
                    {t("ai.assistant")}
                  </span>
                  {renderProgressTrace()}
                  <div className={styles.messageContent}>
                    <AiMarkdownMessage>{assistant.streamingText}</AiMarkdownMessage>
                  </div>
                </div>
              ) : !hasPersistedPendingTurn &&
                !hasStreamingAssistant &&
                assistant.sending ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>
                    {t("ai.assistant")}
                  </span>
                  {renderProgressTrace()}
                </div>
              ) : !hasPersistedPendingTurn &&
                !hasStreamingAssistant &&
                progressStages.length > 0 ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>
                    {t("ai.assistant")}
                  </span>
                  {renderProgressTrace()}
                </div>
              ) : null}
              {assistant.streamingProposalChanges.length > 0 ? (
                <AiProposalProgressCard
                  changes={assistant.streamingProposalChanges}
                />
              ) : proposalStreamText ? (
                <div className={styles.proposal} data-streaming="true">
                  <div className={styles.proposalTitle}>
                    <strong>{t("ai.proposal.generating")}</strong>
                    <span>
                      <AiPlainText>
                        {proposalStreamProgress.summary ||
                          t("ai.proposal.generatingDescription")}
                      </AiPlainText>
                      <i aria-hidden className={styles.streamCursor} />
                    </span>
                  </div>
                  {proposalStreamProgress.completedChanges > 0 ? (
                    <span className={styles.proposalProgress}>
                      {t("ai.proposal.generatingCount", {
                        count: proposalStreamProgress.completedChanges,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {proposals.map((proposal) => (
                <AiProposalCard
                  key={proposal.id}
                  storedProposal={proposal}
                  onApply={(selected) => handleApply(proposal, selected)}
                  onPreview={onPreviewProposal
                    ? (selectedChangeIds) => {
                        const parsed = aiResumeProposalSchema.safeParse(
                          proposal.proposal,
                        );
                        if (!parsed.success) return;
                        const previewed = onPreviewProposal({
                          proposal: parsed.data,
                          baseResumeVersion: proposal.baseResumeVersion,
                          selectedChangeIds,
                        });
                        if (!previewed) {
                          toast.error({
                            key: "ai-proposal-conflict",
                            content: t("ai.proposal.conflict"),
                          });
                        }
                      }
                    : undefined}
                />
              ))}
            </>
          )}
        </div>

        <div className={styles.composer}>
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 6 }}
            disabled={!assistant.enabled || assistant.sending}
            maxLength={8_000}
            placeholder={t("ai.composer.placeholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={(event) => {
              if (event.shiftKey) return;
              event.preventDefault();
              void submitDraft();
            }}
          />
          <div className={styles.composerActions}>
            <p className={styles.hint}>{t("ai.disclaimer")}</p>
            {assistant.sending || assistant.details?.activeRun ? (
              <Button
                disabled={assistant.stopping}
                loading={assistant.stopping}
                onClick={() => void stopCurrentTurn()}
              >
                {assistant.stopping ? t("ai.stopping") : t("ai.stop")}
              </Button>
            ) : (
              <Button
                disabled={!draft.trim() || !assistant.selectedModelId}
                type="primary"
                onClick={() => void submitDraft()}
              >
                {t("ai.send")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        okText={t("editor.save")}
        open={renameOpen}
        title={t("ai.conversation.rename")}
        onCancel={() => setRenameOpen(false)}
        onOk={() => {
          const title = renameValue.trim();
          if (!title) return;
          void assistant
            .rename(title)
            .then(() => setRenameOpen(false))
            .catch(reportError);
        }}
      >
        <Input
          maxLength={100}
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
        />
      </Modal>
    </aside>
  );
}
