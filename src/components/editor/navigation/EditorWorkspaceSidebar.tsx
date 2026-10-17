"use client";

import {
  FileMarkdownOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import type { ReactNode } from "react";

import { HelpIcon } from "@/components/ui/InlineIcons";

import { useEditorWorkspaceSidebarStyles } from "./EditorWorkspaceSidebar.style";

export type EditorWorkspaceView = "outline" | "markdown";

export function EditorWorkspaceSidebar({
  activeView,
  busy = false,
  children,
  helpLabel,
  markdownLabel,
  navigationLabel,
  outlineLabel,
  resizeHandle,
  onSelectMarkdown,
  onSelectOutline,
}: {
  activeView: EditorWorkspaceView;
  busy?: boolean;
  children?: ReactNode;
  helpLabel: string;
  markdownLabel: string;
  navigationLabel: string;
  outlineLabel: string;
  resizeHandle?: ReactNode;
  onSelectMarkdown: () => void;
  onSelectOutline: () => void;
}) {
  const { styles } = useEditorWorkspaceSidebarStyles();

  return (
    <>
      <aside aria-label={navigationLabel} className={styles.rail}>
        <nav aria-label={navigationLabel} className={styles.navigation}>
          <Tooltip placement="right" title={outlineLabel}>
            <Button
              aria-label={outlineLabel}
              aria-pressed={activeView === "outline"}
              className={styles.navigationButton}
              disabled={busy}
              icon={<UnorderedListOutlined aria-hidden="true" />}
              type="text"
              onClick={onSelectOutline}
            />
          </Tooltip>
          <Tooltip placement="right" title={markdownLabel}>
            <Button
              aria-label={markdownLabel}
              aria-pressed={activeView === "markdown"}
              className={styles.navigationButton}
              disabled={busy}
              icon={<FileMarkdownOutlined aria-hidden="true" />}
              type="text"
              onClick={onSelectMarkdown}
            />
          </Tooltip>
        </nav>
        {activeView === "markdown" ? (
          <div className={styles.helpAction}>
            <Tooltip placement="right" title={helpLabel}>
              <Button
                aria-label={helpLabel}
                className={styles.navigationButton}
                href="/docs/markdown-editor"
                icon={<HelpIcon size={17} />}
                rel="noreferrer"
                target="_blank"
                type="text"
              />
            </Tooltip>
          </div>
        ) : null}
      </aside>
      {activeView === "outline" ? (
        <aside aria-label={outlineLabel} className={styles.outlinePanel}>
          {children}
          {resizeHandle}
        </aside>
      ) : null}
    </>
  );
}
