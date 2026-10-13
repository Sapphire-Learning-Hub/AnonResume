"use client";

import { useRef, useState, type CSSProperties } from "react";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { Button, Input } from "antd";

import type { ResumeSection } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

function stopEventPropagation(event: {
  stopPropagation: () => void;
}) {
  event.stopPropagation();
}

function getSectionTitleText(section: ResumeSection) {
  const firstParagraph = section.title?.content[0];
  return firstParagraph?.content
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("") ?? "";
}

function createOutlineItemStyle(params: {
  transform: ReturnType<typeof useSortable>["transform"];
  transition: string | undefined;
}): CSSProperties | undefined {
  const transform = CSS.Transform.toString(params.transform);

  if (!transform && !params.transition) {
    return undefined;
  }

  return {
    transform,
    transition: params.transition,
  };
}

function SortableSectionOutlineItem({
  section,
  sectionIndex,
  sectionCount,
  selected,
  onSelectSection,
  onRenameSection,
  onMoveSection,
  classNames,
}: {
  section: ResumeSection;
  sectionIndex: number;
  sectionCount: number;
  selected: boolean;
  onSelectSection: (sectionId: string) => void;
  onRenameSection: (params: { sectionId: string; title: string }) => void;
  onMoveSection: (params: { sectionId: string; toIndex: number }) => void;
  classNames: {
    outlineItem: string;
    outlineTitleArea: string;
    outlineButton: string;
    outlineTitleText: string;
    outlineMeta: string;
    outlineEditButton: string;
    outlineDragHandle: string;
    outlineTitleInput: string;
    compactActionRow: string;
    outlineOrderButton: string;
  };
}) {
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });
  const { t } = useI18n();
  const titleText = getSectionTitleText(section);
  const sectionTitle = titleText || t("renderer.untitledSection");
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(titleText);
  const cancelEditRef = useRef(false);
  const canMoveUp = sectionIndex > 0;
  const canMoveDown = sectionIndex < sectionCount - 1;

  function startEditing() {
    onSelectSection(section.id);
    setDraftTitle(titleText);
    setEditing(true);
  }

  function finishEditing() {
    setEditing(false);
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setDraftTitle(titleText);
      return;
    }

    const nextTitle = draftTitle.trim();
    if (nextTitle !== titleText) {
      onRenameSection({ sectionId: section.id, title: nextTitle });
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={classNames.outlineItem}
      data-dragging={isDragging}
      data-over={isOver && !isDragging}
      data-selected={selected}
      style={createOutlineItemStyle({ transform, transition })}
      data-testid={`section-outline-item-${section.id}`}
      role="group"
    >
      <Button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("editor.dragSection", { title: sectionTitle })}
        className={classNames.outlineDragHandle}
        icon={<HolderOutlined aria-hidden="true" />}
        size="small"
        type="text"
      />
      <div className={classNames.outlineTitleArea}>
        {editing ? (
          <Input
            autoFocus
            aria-label={t("editor.editSectionTitle", { title: sectionTitle })}
            className={classNames.outlineTitleInput}
            size="small"
            value={draftTitle}
            onBlur={finishEditing}
            onChange={(event) => setDraftTitle(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditRef.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <>
            <button
              type="button"
              aria-label={sectionTitle}
              aria-current={selected ? "true" : undefined}
              aria-pressed={selected}
              className={classNames.outlineButton}
              onClick={() => {
                if (selected) {
                  startEditing();
                  return;
                }
                onSelectSection(section.id);
              }}
            >
              <span className={classNames.outlineTitleText}>{sectionTitle}</span>
              {!section.visible ? (
                <span className={classNames.outlineMeta}>{t("renderer.hidden")}</span>
              ) : null}
            </button>
            <Button
              aria-label={t("editor.editSectionTitleAction", {
                title: sectionTitle,
              })}
              className={classNames.outlineEditButton}
              data-edit-action="true"
              data-visible={selected}
              icon={<EditOutlined aria-hidden="true" />}
              size="small"
              type="text"
              onClick={startEditing}
            />
          </>
        )}
      </div>
      <div className={classNames.compactActionRow}>
        <Button
          className={classNames.outlineOrderButton}
          icon={<UpOutlined aria-hidden="true" />}
          size="small"
          type="text"
          disabled={!canMoveUp}
          aria-label={t("renderer.moveUp", { title: sectionTitle })}
          onClick={(event) => {
            stopEventPropagation(event);
            onMoveSection({
              sectionId: section.id,
              toIndex: sectionIndex - 1,
            });
          }}
        />
        <Button
          className={classNames.outlineOrderButton}
          icon={<DownOutlined aria-hidden="true" />}
          size="small"
          type="text"
          disabled={!canMoveDown}
          aria-label={t("renderer.moveDown", { title: sectionTitle })}
          onClick={(event) => {
            stopEventPropagation(event);
            onMoveSection({
              sectionId: section.id,
              toIndex: sectionIndex + 1,
            });
          }}
        />
      </div>
    </div>
  );
}

export function SectionOutline({
  sections,
  selectedSectionId,
  onSelectSection,
  onRenameSection,
  onMoveSection,
  classNames,
}: {
  sections: ResumeSection[];
  selectedSectionId?: string;
  onSelectSection: (sectionId: string) => void;
  onRenameSection: (params: { sectionId: string; title: string }) => void;
  onMoveSection: (params: { sectionId: string; toIndex: number }) => void;
  classNames: {
    outlineList: string;
    outlineItem: string;
    outlineTitleArea: string;
    outlineButton: string;
    outlineTitleText: string;
    outlineMeta: string;
    outlineEditButton: string;
    outlineDragHandle: string;
    outlineTitleInput: string;
    compactActionRow: string;
    outlineOrderButton: string;
  };
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const sectionIds = sections.map((section) => section.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const activeIndex = sectionIds.indexOf(String(active.id));
    const overIndex = sectionIds.indexOf(String(over.id));

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    const nextSectionIds = arrayMove(sectionIds, activeIndex, overIndex);
    const nextIndex = nextSectionIds.indexOf(String(active.id));

    if (nextIndex === -1 || nextIndex === activeIndex) {
      return;
    }

    onMoveSection({
      sectionId: String(active.id),
      toIndex: nextIndex,
    });
  }

  return (
    <DndContext
      id="resume-section-outline"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sectionIds}
        strategy={verticalListSortingStrategy}
      >
        <div className={classNames.outlineList}>
          {sections.map((section, sectionIndex) => (
            <SortableSectionOutlineItem
              key={section.id}
              section={section}
              sectionIndex={sectionIndex}
              sectionCount={sections.length}
              selected={selectedSectionId === section.id}
              onSelectSection={onSelectSection}
              onRenameSection={onRenameSection}
              onMoveSection={onMoveSection}
              classNames={{
                outlineItem: classNames.outlineItem,
                outlineTitleArea: classNames.outlineTitleArea,
                outlineButton: classNames.outlineButton,
                outlineTitleText: classNames.outlineTitleText,
                outlineMeta: classNames.outlineMeta,
                outlineEditButton: classNames.outlineEditButton,
                outlineDragHandle: classNames.outlineDragHandle,
                outlineTitleInput: classNames.outlineTitleInput,
                compactActionRow: classNames.compactActionRow,
                outlineOrderButton: classNames.outlineOrderButton,
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
