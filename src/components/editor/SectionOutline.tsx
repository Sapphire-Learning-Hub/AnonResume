"use client";

import type { CSSProperties } from "react";

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
import { Button } from "antd";

import type { ResumeSection } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

function stopEventPropagation(event: {
  stopPropagation: () => void;
}) {
  event.stopPropagation();
}

function getSectionTitle(section: ResumeSection, untitledSectionLabel: string) {
  const firstParagraph = section.title?.content[0];
  const text = firstParagraph?.content
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");

  return text || untitledSectionLabel;
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
  onMoveSection,
  classNames,
}: {
  section: ResumeSection;
  sectionIndex: number;
  sectionCount: number;
  selected: boolean;
  onSelectSection: (sectionId: string) => void;
  onMoveSection: (params: { sectionId: string; toIndex: number }) => void;
  classNames: {
    outlineItem: string;
    outlineButton: string;
    outlineMeta: string;
    compactActionRow: string;
  };
}) {
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });
  const { t } = useI18n();
  const sortableAttributes = {
    ...attributes,
    role: undefined,
    "aria-roledescription": undefined,
  };
  const sectionTitle = getSectionTitle(section, t("renderer.untitledSection"));
  const canMoveUp = sectionIndex > 0;
  const canMoveDown = sectionIndex < sectionCount - 1;
  return (
    <div
      ref={setNodeRef}
      className={classNames.outlineItem}
      data-dragging={isDragging}
      data-over={isOver && !isDragging}
      style={createOutlineItemStyle({ transform, transition })}
      data-testid={`section-outline-item-${section.id}`}
      {...sortableAttributes}
      {...listeners}
      role="group"
      aria-label={t("editor.dragSection", { title: sectionTitle })}
    >
      <button
        type="button"
        aria-label={sectionTitle}
        aria-current={selected ? "true" : undefined}
        aria-pressed={selected}
        className={classNames.outlineButton}
        onClick={() => onSelectSection(section.id)}
      >
        <span>{sectionTitle}</span>
        {!section.visible ? (
          <span className={classNames.outlineMeta}>{t("renderer.hidden")}</span>
        ) : null}
      </button>
      <div className={classNames.compactActionRow}>
        <Button
          size="small"
          disabled={!canMoveUp}
          aria-label={t("renderer.moveUp", { title: sectionTitle })}
          onPointerDown={stopEventPropagation}
          onClick={(event) => {
            stopEventPropagation(event);
            onMoveSection({
              sectionId: section.id,
              toIndex: sectionIndex - 1,
            });
          }}
        >
          {t("common.up")}
        </Button>
        <Button
          size="small"
          disabled={!canMoveDown}
          aria-label={t("renderer.moveDown", { title: sectionTitle })}
          onPointerDown={stopEventPropagation}
          onClick={(event) => {
            stopEventPropagation(event);
            onMoveSection({
              sectionId: section.id,
              toIndex: sectionIndex + 1,
            });
          }}
        >
          {t("common.down")}
        </Button>
      </div>
    </div>
  );
}

export function SectionOutline({
  sections,
  selectedSectionId,
  onSelectSection,
  onMoveSection,
  classNames,
}: {
  sections: ResumeSection[];
  selectedSectionId?: string;
  onSelectSection: (sectionId: string) => void;
  onMoveSection: (params: { sectionId: string; toIndex: number }) => void;
  classNames: {
    outlineList: string;
    outlineItem: string;
    outlineButton: string;
    outlineMeta: string;
    compactActionRow: string;
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
              onMoveSection={onMoveSection}
              classNames={{
                outlineItem: classNames.outlineItem,
                outlineButton: classNames.outlineButton,
                outlineMeta: classNames.outlineMeta,
                compactActionRow: classNames.compactActionRow,
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
