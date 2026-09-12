"use client";

import { Modal } from "antd";
import { useSyncExternalStore } from "react";

import { useI18n } from "@/i18n/I18nProvider";

import { useEditorShortcutPanelStyles } from "./EditorShortcutPanel.style";

type ShortcutItem = {
  keys: string;
  label: string;
  alternateKeys?: string;
};

type ShortcutPlatform = "macos" | "other";

function detectShortcutPlatform(userAgent: string): ShortcutPlatform {
  return /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(userAgent)
    ? "macos"
    : "other";
}

function subscribeToUserAgent() {
  return () => undefined;
}

function getClientShortcutPlatform(): ShortcutPlatform {
  return detectShortcutPlatform(window.navigator.userAgent);
}

function getServerShortcutPlatform(): ShortcutPlatform {
  return "other";
}

export function EditorShortcutPanel({
  open,
  onCancel,
}: {
  open: boolean;
  onCancel: () => void;
}) {
  const { styles } = useEditorShortcutPanelStyles();
  const { t } = useI18n();
  const platform = useSyncExternalStore(
    subscribeToUserAgent,
    getClientShortcutPlatform,
    getServerShortcutPlatform,
  );
  const modifier = platform === "macos" ? "⌘" : "Ctrl";

  const groups: Array<{ title: string; items: ShortcutItem[] }> = [
    {
      title: t("editor.shortcuts.group.general"),
      items: [
        { label: t("editor.save"), keys: `${modifier} + S` },
        { label: t("editor.undo"), keys: `${modifier} + Z` },
        {
          label: t("editor.redo"),
          keys: `${modifier} + Shift + Z`,
          alternateKeys: platform === "macos" ? undefined : "Ctrl + Y",
        },
        { label: t("editor.shortcuts.open"), keys: `${modifier} + /` },
      ],
    },
    {
      title: t("editor.shortcuts.group.text"),
      items: [
        { label: t("editor.bold"), keys: `${modifier} + B` },
        { label: t("editor.italic"), keys: `${modifier} + I` },
        { label: t("editor.underline"), keys: `${modifier} + U` },
        { label: t("editor.strike"), keys: `${modifier} + Shift + S` },
        { label: t("editor.inlineTag"), keys: `${modifier} + E` },
        { label: t("editor.link"), keys: `${modifier} + K` },
      ],
    },
    {
      title: t("editor.shortcuts.group.layoutNavigation"),
      items: [
        {
          label: t(
            platform === "macos"
              ? "editor.shortcuts.temporaryLayoutMacos"
              : "editor.shortcuts.temporaryLayout",
          ),
          keys: platform === "macos" ? "Control" : "Ctrl",
        },
        { label: t("editor.shortcuts.previousNextTab"), keys: "← / →" },
        { label: t("editor.shortcuts.firstLastTab"), keys: "Home / End" },
      ],
    },
  ];

  return (
    <Modal
      destroyOnHidden
      footer={null}
      open={open}
      title={t("editor.shortcuts.title")}
      width={680}
      onCancel={onCancel}
    >
      <div className={styles.groupGrid}>
        {groups.map((group) => (
          <section className={styles.group} key={group.title}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <div className={styles.shortcutList}>
              {group.items.map((shortcut) => (
                <div className={styles.shortcutRow} key={shortcut.label}>
                  <span>{shortcut.label}</span>
                  <span className={styles.keySequences}>
                    <kbd className={styles.keySequence}>{shortcut.keys}</kbd>
                    {shortcut.alternateKeys ? (
                      <>
                        <span className={styles.orLabel}>{t("editor.shortcuts.or")}</span>
                        <kbd className={styles.keySequence}>{shortcut.alternateKeys}</kbd>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
