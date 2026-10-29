"use client";

import { Button, Tooltip } from "antd";
import {
  DownOutlined,
  UpOutlined,
  RightOutlined,
  ArrowUpOutlined,
} from "@ant-design/icons";
import { findBlockByPath } from "@/domain/resume/block-tree";
import {
  resolveBlockRange,
  type BlockCompositionCommand,
} from "@/domain/resume/composition/operations";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeDocument } from "@/domain/resume/schema";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { useI18n } from "@/i18n/I18nProvider";
import { CompositionMenu } from "./CompositionMenu";
import { getOutlineLabel } from "./outline-labels";
import { useCanvasBlockActionsStyles } from "./CanvasBlockActions.style";

export function CanvasBlockActions({
  document,
  selection,
  onSelect,
  onMove,
  onCompose,
}: {
  document: ResumeDocument;
  selection: ResumeEditorSelection;
  onSelect: (selection: ResumeEditorSelection) => void;
  onMove: (toIndex: number) => void;
  onCompose: (command: BlockCompositionCommand) => void;
}) {
  const { styles } = useCanvasBlockActionsStyles();
  const { t } = useI18n();
  const section = document.sections.find(
    (section) => section.id === selection.sectionId,
  );
  const path = selection.blockPath ?? [];
  if (!section || !path.length) return null;
  const trail = path.flatMap((_, index) => {
    const currentPath = path.slice(0, index + 1);
    const block = findBlockByPath(section.blocks, currentPath);
    return block ? [{ block, path: currentPath }] : [];
  });
  if (!trail.length) return null;
  const range = resolveBlockRange(document, selection);
  const parent = trail.at(-2);
  const locked =
    parent?.block.type === "row" && Boolean(parent.block.columnLayout);
  const title =
    (section.title ? getPlainTextFromRichText(section.title) : "") ||
    t("renderer.untitledSection");
  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label={t("outline.actions")}
    >
      <nav className={styles.path} aria-label={t("outline.path")}>
        <Button
          className={styles.crumb}
          type="text"
          size="small"
          onClick={() => onSelect({ sectionId: section.id })}
        >
          {title}
        </Button>
        {trail.slice(-3).map(({ block, path }, index) => {
          const label = getOutlineLabel(
            { kind: "block", path, block, children: [] },
            t,
          );
          return (
            <span key={block.id}>
              <RightOutlined aria-hidden />
              <Button
                className={styles.crumb}
                type="text"
                size="small"
                aria-label={t("outline.select", { label })}
                aria-current={
                  index === Math.min(trail.length, 3) - 1 ? "true" : undefined
                }
                onClick={() =>
                  onSelect({ sectionId: section.id, blockPath: path })
                }
              >
                {label}
              </Button>
            </span>
          );
        })}
      </nav>
      {range && range.blocks.length > 1 ? (
        <span className={styles.count}>
          {t("outline.multi", { count: range.blocks.length })}
        </span>
      ) : null}
      <Tooltip title={t("outline.parent")}>
        <Button
          className={styles.action}
          type="text"
          size="small"
          aria-label={t("outline.parent")}
          disabled={!parent}
          icon={<ArrowUpOutlined />}
          onClick={() =>
            parent &&
            onSelect({ sectionId: section.id, blockPath: parent.path })
          }
        />
      </Tooltip>
      <Button
        className={styles.action}
        type="text"
        size="small"
        aria-label={t("renderer.moveUp", { title: "" }).trim()}
        disabled={!range || locked || range.start === 0}
        icon={<UpOutlined />}
        onClick={() => range && onMove(range.start - 1)}
      />
      <Button
        className={styles.action}
        type="text"
        size="small"
        aria-label={t("renderer.moveDown", { title: "" }).trim()}
        disabled={
          !range ||
          locked ||
          range.start + range.blocks.length === range.siblings.length
        }
        icon={<DownOutlined />}
        onClick={() => range && onMove(range.start + 1)}
      />
      <CompositionMenu
        className={styles.action}
        document={document}
        selection={selection}
        onCompose={onCompose}
      />
    </div>
  );
}
