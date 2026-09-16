"use client";

import { useState } from "react";

import { Button, Checkbox, Tag } from "antd";

import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import type { AiStoredProposal } from "@/lib/ai/client";
import { useI18n } from "@/i18n/I18nProvider";

import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";

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
    default:
      return t("ai.change.unknown");
  }
}

function proposedText(change: { type: string; content?: unknown }) {
  if (!change.content || typeof change.content !== "object") return "";
  const content = change.content as {
    content?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return (
    content.content
      ?.flatMap((node) => node.content ?? [])
      .map((node) => node.text ?? "")
      .join("") ?? ""
  );
}

export function AiProposalCard({
  storedProposal,
  onApply,
}: {
  storedProposal: AiStoredProposal;
  onApply: (selectedChangeIds: string[]) => Promise<boolean>;
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
  return (
    <div className={styles.proposal}>
      <div className={styles.proposalHeader}>
        <div className={styles.proposalTitle}>
          <strong>{t("ai.proposal.title")}</strong>
          <span>{proposal.summary ?? t("ai.proposal.description")}</span>
        </div>
        {storedProposal.appliedAt ? (
          <Tag color="success">{t("ai.proposal.applied")}</Tag>
        ) : null}
      </div>
      <div className={styles.changes}>
        {proposal.changes.map((change) => {
          const applied = storedProposal.appliedChangeIds.includes(change.id);
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
                <small>{change.reason}</small>
                {change.type === "delete_list_item" ? (
                  <span>{t("ai.change.deleteDescription")}</span>
                ) : (
                  <span>{proposedText(change) || t("ai.change.richText")}</span>
                )}
              </div>
            </label>
          );
        })}
      </div>
      <Button
        block
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
  );
}
