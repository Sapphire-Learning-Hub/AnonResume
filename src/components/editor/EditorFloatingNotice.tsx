"use client";

import { WarningOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

import { useEditorFloatingNoticeStyles } from "./EditorFloatingNotice.style";

export function EditorFloatingNoticeStack({ children }: { children: ReactNode }) {
  const { styles } = useEditorFloatingNoticeStyles();

  return (
    <div
      className={styles.stack}
      data-editor-floating-notice-stack="true"
    >
      {children}
    </div>
  );
}

export function EditorFloatingNotice({
  actions,
  ariaLabel,
  description,
  title,
}: {
  actions: ReactNode;
  ariaLabel: string;
  description: ReactNode;
  title: ReactNode;
}) {
  const { styles } = useEditorFloatingNoticeStyles();

  return (
    <section
      aria-label={ariaLabel}
      className={styles.notice}
      data-editor-floating-notice="true"
      role="status"
    >
      <div className={styles.message}>
        <span aria-hidden="true" className={styles.icon}>
          <WarningOutlined />
        </span>
        <span className={styles.text}>
          <strong className={styles.title}>{title}</strong>
          <span className={styles.description}>{description}</span>
        </span>
      </div>
      <div className={styles.actions}>{actions}</div>
    </section>
  );
}
