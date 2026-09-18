"use client";

import { useState } from "react";

import { Button, Checkbox, Tag } from "antd";

import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import type { AiStoredProposal } from "@/lib/ai/client";
import { createAiProposalProgressChanges } from "@/lib/ai/proposals/progress";
import type { AiProposalProgressChange } from "@/lib/ai/runs/stream-events";
import { useI18n } from "@/i18n/I18nProvider";

import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";
import { AiPlainText } from "./AiPlainText";

function changeLabel(type: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (type) {
    case "replace_section_title":
      return t("ai.change.sectionTitle");
    case "replace_text":
      return t("ai.change.text");
    case "replace_list_item":
      return t("ai.change.listItem");
    case "insert_list_item":
      return t("ai.change.insertItem");
    case "delete_list_item":
      return t("ai.change.deleteItem");
    case "create_section":
      return t("ai.change.createSection");
    case "delete_section":
      return t("ai.change.deleteSection");
    case "move_section":
      return t("ai.change.moveSection");
    case "insert_block":
      return t("ai.change.insertBlock");
    case "delete_block":
      return t("ai.change.deleteBlock");
    case "move_block":
      return t("ai.change.moveBlock");
    default:
      return t("ai.change.unknown");
  }
}

export function AiProposalProgressCard({
  changes,
}: {
  changes: AiProposalProgressChange[];
}) {
  const { styles } = useAiAssistantPanelStyles();
  const { t } = useI18n();

  return (
    <div aria-live="polite" className={styles.proposal} data-streaming="true">
      <div className={styles.proposalTitle}>
        <strong>{t("ai.proposal.generating")}</strong>
        <span>{t("ai.proposal.generatingDescription")}</span>
      </div>
      <div className={styles.changes}>
        {changes.map((change) => (
          <div className={styles.change} key={change.id}>
            <strong>{changeLabel(change.type, t)}</strong>
            <div className={styles.changeText}>
              <small><AiPlainText>{change.reason}</AiPlainText></small>
              {change.preview ? (
                <span><AiPlainText>{change.preview}</AiPlainText></span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <span className={styles.proposalProgress}>
        {t("ai.proposal.generatingCount", { count: changes.length })}
        <i aria-hidden className={styles.streamCursor} />
      </span>
    </div>
  );
}

export function AiProposalCard({
  storedProposal,
  onApply,
  onPreview,
}: {
  storedProposal: AiStoredProposal;
  onApply: (selectedChangeIds: string[]) => Promise<boolean>;
  onPreview?: (selectedChangeIds: string[]) => void;
}) {
  const { styles } = useAiAssistantPanelStyles();
  const { t } = useI18n();
  const parsed = aiResumeProposalSchema.safeParse(storedProposal.proposal);
  const [selected, setSelected] = useState<string[]>(() =>
    parsed.success
      ? parsed.data.changes
          .filter((change) => !storedProposal.appliedChangeIds.includes(change.id))
          .map((change) => change.id)
      : [],
  );
  const [applying, setApplying] = useState(false);

  if (!parsed.success || storedProposal.completionState !== "complete") {
    return (
      <div className={styles.proposal}>
        <div className={styles.proposalHeader}>
          <strong>{t("ai.proposal.invalidTitle")}</strong>
          <Tag color="error">{t("ai.proposal.unavailable")}</Tag>
        </div>
        <p className={styles.hint}>{t("ai.proposal.invalidDescription")}</p>
      </div>
    );
  }

  const proposal = parsed.data;
  const proposalChanges = createAiProposalProgressChanges(proposal.changes);
  return (
    <div className={styles.proposal}>
      <div className={styles.proposalHeader}>
        <div className={styles.proposalTitle}>
          <strong>{t("ai.proposal.title")}</strong>
          <span>
            <AiPlainText>
              {proposal.summary ?? t("ai.proposal.description")}
            </AiPlainText>
          </span>
        </div>
        {storedProposal.appliedAt ? (
          <Tag color="success">{t("ai.proposal.applied")}</Tag>
        ) : null}
      </div>
      <div className={styles.changes}>
        {proposal.changes.map((change, index) => {
          const applied = storedProposal.appliedChangeIds.includes(change.id);
          const preview = proposalChanges[index]?.preview;
          return (
            <label className={styles.change} key={change.id}>
              <Checkbox
                checked={applied || selected.includes(change.id)}
                disabled={applied}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, change.id]
                      : current.filter((id) => id !== change.id),
                  )
                }
              >
                {changeLabel(change.type, t)}
              </Checkbox>
              <div className={styles.changeText}>
                <small><AiPlainText>{change.reason}</AiPlainText></small>
                {change.type === "delete_list_item" ? (
                  <span>{t("ai.change.deleteDescription")}</span>
                ) : (
                  <span>
                    <AiPlainText>
                      {preview || t("ai.change.richText")}
                    </AiPlainText>
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
      <div className={styles.proposalActions}>
        {onPreview ? (
          <Button
            disabled={selected.length === 0}
            onClick={() => onPreview(selected)}
          >
            {t("ai.proposal.previewSelected")}
          </Button>
        ) : null}
        <Button
          disabled={selected.length === 0}
          loading={applying}
          type="primary"
          onClick={() => {
            setApplying(true);
            void onApply(selected).finally(() => setApplying(false));
          }}
        >
          {t("ai.proposal.applySelected", { count: selected.length })}
        </Button>
      </div>
    </div>
  );
}
