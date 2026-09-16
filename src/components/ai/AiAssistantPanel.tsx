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

import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";
import { AiProposalCard } from "./AiProposalCard";
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
  }) => ReturnType<
    typeof import("@/domain/resume/ai/proposal-apply").applySelectedAiChanges
  >;
}) {
  const { styles } = useAiAssistantPanelStyles();
  const { t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const [draft, setDraft] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const resizeStateRef = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | undefined>(undefined);

  function reportError(error: unknown) {
    const code = error instanceof AiClientError ? error.code : "ai_request_failed";
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
    const result = onApplyProposal({
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
    toast.success({
      key: "ai-proposal-applied",
      content: t("ai.proposal.applySuccess"),
    });
    void markAiProposalApplied({
      proposalId: storedProposal.id,
      selectedChangeIds,
    })
      .then(assistant.refresh)
      .catch(() => undefined);
    return true;
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

  const messages = assistant.details?.messages ?? [];
  const proposals = assistant.details?.proposals ?? [];
  const activeProposalCheckpoint = assistant.details?.activeRun?.proposal;
  const proposalStreamText =
    assistant.streamingProposalText ||
    (typeof activeProposalCheckpoint === "string"
      ? activeProposalCheckpoint
      : "");
  const proposalStreamProgress = getAiProposalStreamProgress(
    proposalStreamText,
  );
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
              options={assistant.conversations.map((conversation) => ({
                value: conversation.id,
                label: conversation.title,
              }))}
              placeholder={t("ai.conversation.new")}
              value={assistant.selectedConversationId}
              onChange={assistant.setSelectedConversationId}
            />
            <Button onClick={assistant.startNewConversation}>
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
                  label: `${model.displayName} · ${
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
            <div className={styles.empty}><Spin /></div>
          ) : messages.length === 0 &&
            !assistant.pendingUserMessage &&
            !assistant.streamingText &&
            !proposalStreamText ? (
            <Empty
              description={
                assistant.enabled ? t("ai.empty") : t("ai.unavailable")
              }
            />
          ) : (
            <>
              {messages.map((message) => (
                <div className={styles.message} data-role={message.role} key={message.id}>
                  <span className={styles.messageRole}>
                    {message.role === "user" ? t("ai.you") : t("ai.assistant")}
                  </span>
                  <span>
                    {(message.completionState === "streaming"
                      ? assistant.streamingText ||
                        message.text ||
                        assistant.details?.activeRun?.text
                      : message.text) ||
                      t("ai.thinking")}
                  </span>
                </div>
              ))}
              {assistant.pendingUserMessage && !hasPersistedPendingTurn ? (
                <div className={styles.message} data-role="user">
                  <span className={styles.messageRole}>{t("ai.you")}</span>
                  <span>{assistant.pendingUserMessage}</span>
                </div>
              ) : null}
              {!hasPersistedPendingTurn && assistant.streamingText ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>{t("ai.assistant")}</span>
                  <span>{assistant.streamingText}</span>
                </div>
              ) : !hasPersistedPendingTurn && assistant.sending ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>{t("ai.assistant")}</span>
                  <span>{t("ai.thinking")}</span>
                </div>
              ) : null}
              {proposalStreamText ? (
                <div className={styles.proposal} data-streaming="true">
                  <div className={styles.proposalTitle}>
                    <strong>{t("ai.proposal.generating")}</strong>
                    <span>
                      {proposalStreamProgress.summary ||
                        t("ai.proposal.generatingDescription")}
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
              <Button onClick={() => void assistant.stop().catch(reportError)}>
                {t("ai.stop")}
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
