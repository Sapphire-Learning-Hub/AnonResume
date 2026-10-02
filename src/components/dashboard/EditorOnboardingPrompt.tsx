"use client";

import { Button, Modal } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import { updateEditorOnboardingRunClient } from "@/lib/onboarding/client";

const useStyles = createStyles(({ token, css }) => ({
  description: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
}));

export interface EditorOnboardingPromptValue {
  href: string;
  runId: string;
}

export function EditorOnboardingPrompt({
  prompt,
}: {
  prompt: EditorOnboardingPromptValue;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [pendingAction, setPendingAction] = useState<"start" | "pause">();

  async function performAction(action: "start" | "pause") {
    if (pendingAction) return;
    setPendingAction(action);

    try {
      await updateEditorOnboardingRunClient(prompt.runId, { type: action });
      if (action === "start") {
        router.push(prompt.href);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      toast.error({
        content: t("onboarding.prompt.error"),
        key: "editor-onboarding-prompt-error",
      });
    } finally {
      setPendingAction(undefined);
    }
  }

  return (
    <Modal
      centered
      closable={false}
      destroyOnHidden
      footer={[
        <Button
          disabled={Boolean(pendingAction)}
          key="pause"
          loading={pendingAction === "pause"}
          onClick={() => void performAction("pause")}
        >
          {t("onboarding.prompt.defer")}
        </Button>,
        <Button
          disabled={Boolean(pendingAction)}
          key="start"
          loading={pendingAction === "start"}
          onClick={() => void performAction("start")}
          type="primary"
        >
          {t("onboarding.prompt.start")}
        </Button>,
      ]}
      keyboard={false}
      mask={{ closable: false }}
      open={open}
      title={t("onboarding.prompt.title")}
      width={520}
    >
      <p className={styles.description}>{t("onboarding.prompt.description")}</p>
    </Modal>
  );
}
