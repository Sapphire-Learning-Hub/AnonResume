"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { SectionOutline } from "@/components/editor/SectionOutline";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { useI18n } from "@/i18n/I18nProvider";
import { BlockOutline } from "./BlockOutline";
import { useBlockOutlineStyles } from "./BlockOutline.style";

type BlockProps = ComponentProps<typeof BlockOutline>;
type SectionProps = ComponentProps<typeof SectionOutline>;

export function StructureOutline({
  document,
  selection,
  layout,
  onSelect,
  onSelectSection,
  onRenameSection,
  onMoveSection,
  onMoveBlock,
  onMoveRange,
  onCompose,
  classNames,
}: {
  document: ResumeDocument;
  selection: ResumeEditorSelection;
  layout: boolean;
  onSelect: BlockProps["onSelect"];
  onMoveBlock: BlockProps["onMoveBlock"];
  onMoveRange: BlockProps["onMoveRange"];
  onCompose: BlockProps["onCompose"];
  onSelectSection: SectionProps["onSelectSection"];
  onRenameSection: SectionProps["onRenameSection"];
  onMoveSection: SectionProps["onMoveSection"];
  classNames: SectionProps["classNames"];
}) {
  const { styles } = useBlockOutlineStyles();
  const { t } = useI18n();
  const key = JSON.stringify([selection.sectionId, selection.blockPath]);
  const [expanded, setExpanded] = useState({
    key,
    sections: new Set([selection.sectionId ?? document.sections[0]?.id]),
    visited: new Set([selection.sectionId ?? document.sections[0]?.id]),
  });
  if (expanded.key !== key)
    setExpanded({
      key,
      sections: selection.sectionId
        ? new Set([...expanded.sections, selection.sectionId])
        : expanded.sections,
      visited: selection.sectionId
        ? new Set([...expanded.visited, selection.sectionId])
        : expanded.visited,
    });
  return (
    <SectionOutline
      sections={document.sections}
      selectedSectionId={selection.sectionId}
      onSelectSection={onSelectSection}
      onRenameSection={onRenameSection}
      onMoveSection={onMoveSection}
      classNames={classNames}
      sortingEnabled={layout}
      renderSectionPrefix={(section) => {
        const open = expanded.sections.has(section.id);
        const label =
          (section.title ? getPlainTextFromRichText(section.title) : "") ||
          t("renderer.untitledSection");
        return (
          <span className={styles.prefix}>
            <Button
              className={styles.control}
              type="text"
              size="small"
              aria-label={t(open ? "outline.collapse" : "outline.expand", {
                label,
              })}
              icon={open ? <DownOutlined /> : <RightOutlined />}
              onClick={() => {
                const sections = new Set(expanded.sections);
                if (!sections.delete(section.id)) sections.add(section.id);
                setExpanded({
                  key,
                  sections,
                  visited: new Set([...expanded.visited, section.id]),
                });
              }}
            />
          </span>
        );
      }}
      renderSectionChildren={(section) =>
        expanded.visited.has(section.id) ? (
          <div
            className={styles.contents}
            hidden={!expanded.sections.has(section.id)}
          >
            <BlockOutline
              document={document}
              section={section}
              selection={selection}
              layout={layout}
              onSelect={onSelect}
              onMoveBlock={onMoveBlock}
              onMoveRange={onMoveRange}
              onCompose={onCompose}
            />
          </div>
        ) : null
      }
    />
  );
}
