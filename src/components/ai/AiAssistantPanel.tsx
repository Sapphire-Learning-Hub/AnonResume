"use client";

import { useState } from "react";

import {
  Button,
  Drawer,
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
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";

import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";
import { AiProposalCard } from "./AiProposalCard";
import { useAiConversation } from "./useAiConversation";

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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

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

  const messages = assistant.details?.messages ?? [];
  const proposals = assistant.details?.proposals ?? [];
  const currentConversation = assistant.conversations.find(
    (conversation) => conversation.id === assistant.selectedConversationId,
  );

  return (
    <Drawer
      destroyOnHidden={false}
      open={open}
      placement="right"
      title={t("ai.title")}
      width={480}
      onClose={onClose}
    >
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
          ) : messages.length === 0 && !assistant.streamingText ? (
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
                    {message.text ||
                      (message.completionState === "streaming"
                        ? assistant.details?.activeRun?.text
                        : "") ||
                      t("ai.thinking")}
                  </span>
                </div>
              ))}
              {assistant.pendingUserMessage ? (
                <div className={styles.message} data-role="user">
                  <span className={styles.messageRole}>{t("ai.you")}</span>
                  <span>{assistant.pendingUserMessage}</span>
                </div>
              ) : null}
              {assistant.streamingText ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>{t("ai.assistant")}</span>
                  <span>{assistant.streamingText}</span>
                </div>
              ) : assistant.sending ? (
                <div className={styles.message} data-role="assistant">
                  <span className={styles.messageRole}>{t("ai.assistant")}</span>
                  <span>{t("ai.thinking")}</span>
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
              if (!draft.trim()) return;
              const message = draft.trim();
              setDraft("");
              void assistant.send(message).catch(reportError);
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
                onClick={() => {
                  const message = draft.trim();
                  if (!message) return;
                  setDraft("");
                  void assistant.send(message).catch(reportError);
                }}
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
    </Drawer>
  );
}
