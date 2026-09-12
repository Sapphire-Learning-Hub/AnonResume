"use client";

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
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import {
  findBlockByPath,
  findTextBlock,
  getPlainTextFromRichText,
} from "@/domain/resume/operations";
import {
  paginateMeasuredSections,
  type MeasuredResumeNode,
  type MeasuredResumeSection,
  type ResumePageFragment,
  type ResumePageLayout,
  type ResumePageSectionLayout,
} from "@/domain/resume/pagination";
import type {
  BadgeBlock,
  GroupBlock,
  ListBlock,
  RowBlock,
  ResumeBlock,
  ResumeDocument,
  ResumeListItem,
  RichTextContent,
  TextBlock,
} from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";
import { getResumeStyleVariables } from "@/styles/resume-style-vars";

import {
  TiptapTextBlockEditor,
  type TiptapInlineToolbarLabels,
  type TiptapTextBlockEditorFormatState,
  type TiptapTextBlockEditorHandle,
} from "./TiptapTextBlockEditor";
import { resolveBlockMoveFromDrag } from "./block-dnd";
import {
  ResumeDiffChangedText,
  ResumeDiffProvider,
  ResumeDiffTarget,
  useResumeDiffAnnotations,
} from "./ResumeDiffAnnotation";
import { ResumeInlineIcon } from "./ResumeInlineIcon";
import { ResumePrintReadyFlag } from "./ResumePrintReadyFlag";
import { useResumeRendererStyles } from "./ResumeRenderer.style";
import type {
  ResumeDiffNodeAnnotation,
  ResumeDiffTextSegment,
  ResumeRendererDiffPresentation,
} from "./resume-diff-presentation";

export interface ResumeRendererProps {
  document: ResumeDocument;
  mode: "edit" | "view" | "print";
  editSurfaceMode?: "content" | "layout";
  paginationRevision?: number;
  responsiveView?: boolean;
  showPrintSafeArea?: boolean;
  zoom?: number;
  diffPresentation?: ResumeRendererDiffPresentation;
  selection?: ResumeEditorSelection;
  onSelectBlock?: (selection: ResumeEditorSelection) => void;
  onChangeSectionTitle?: (params: {
    sectionId: string;
    content: RichTextContent;
  }) => void;
  onChangeTextBlock?: (params: {
    sectionId: string;
    blockPath: string[];
    content: RichTextContent;
  }) => void;
  onMoveBlock?: (params: {
    sectionId: string;
    blockPath: string[];
    toIndex: number;
  }) => void;
  textEditorRef?: Ref<TiptapTextBlockEditorHandle>;
  onTextEditorFormattingStateChange?: (
    state: TiptapTextBlockEditorFormatState,
  ) => void;
  onPageCountChange?: (pageCount: number) => void;
  onPaginationReadyChange?: (ready: boolean) => void;
}

type ResumeRendererStyles = ReturnType<typeof useResumeRendererStyles>["styles"];
type Translator = ReturnType<typeof useI18n>["t"];
type SortableBlockAxis = "vertical" | "horizontal" | "grid";
const A4_PAGE_HEIGHT_PX = (297 / 25.4) * 96;
const DEFAULT_SECTION_GAP_PX = 20;
const DEFAULT_BLOCK_GAP_PX = 10;
const BLOCK_PATH_SEPARATOR = "::";
const UNSAFE_LINK_PROTOCOL_PATTERN = /^\s*(?:javascript|data):/i;

function serializeBlockPath(blockPath: string[]) {
  return blockPath.join(BLOCK_PATH_SEPARATOR);
}

function getInlineToolbarLabels(t: Translator): TiptapInlineToolbarLabels {
  return {
    applyLink: t("editor.applyLink"),
    ariaLabel: t("editor.inlineTextFormatting"),
    bold: t("editor.bold"),
    boldShortcut: t("editor.boldShortcut"),
    inlineTag: t("editor.inlineTag"),
    inlineTagShortcut: t("editor.inlineTagShortcut"),
    textColor: t("editor.inlineTextColor"),
    clearTextColor: t("editor.clearTextColor"),
    colorPalette: t("common.colorPalette"),
    italic: t("editor.italic"),
    italicShortcut: t("editor.italicShortcut"),
    link: t("editor.link"),
    linkPlaceholder: t("editor.linkPlaceholder"),
    linkShortcut: t("editor.linkShortcut"),
    removeLink: t("editor.removeLink"),
    strike: t("editor.strike"),
    strikeShortcut: t("editor.strikeShortcut"),
    underline: t("editor.underline"),
    underlineShortcut: t("editor.underlineShortcut"),
  };
}

function createWholeBlockLayout(block: ResumeBlock): ResumePageFragment {
  return {
    path: [block.id],
  };
}

function createWholeSectionLayout(
  section: ResumeDocument["sections"][number],
): ResumePageSectionLayout {
  return {
    sectionId: section.id,
    includeTitle: Boolean(section.title),
    blocks: section.blocks.map(createWholeBlockLayout),
    totalHeight: 0,
  };
}

function applyMarks(
  content: ReactNode,
  marks: NonNullable<RichTextContent["content"][number]["content"][number] extends infer T
    ? T extends { marks?: infer M }
      ? M
      : never
    : never>,
): ReactNode {
  return marks.reduce<ReactNode>((current, mark, markIndex) => {
    const key = `${mark.type}-${markIndex}`;

    switch (mark.type) {
      case "bold":
        return <strong key={key}>{current}</strong>;
      case "italic":
        return <em key={key}>{current}</em>;
      case "underline":
        return <u key={key}>{current}</u>;
      case "strike":
        return <s key={key}>{current}</s>;
      case "code":
        return <code key={key}>{current}</code>;
      case "tag":
        return (
          <span key={key} data-resume-inline-tag="true">
            {current}
          </span>
        );
      case "textColor":
        return mark.attrs?.color ? (
          <span
            key={key}
            data-resume-text-color={mark.attrs.color}
            style={{ color: mark.attrs.color }}
          >
            {current}
          </span>
        ) : (
          current
        );
      case "link":
        if (!mark.attrs?.href || UNSAFE_LINK_PROTOCOL_PATTERN.test(mark.attrs.href)) {
          return <span key={key}>{current}</span>;
        }

        return (
          <a key={key} href={mark.attrs.href}>
            {current}
          </a>
        );
    }
  }, content);
}

function renderRichText(content: RichTextContent): ReactNode {
  return content.content.map((paragraph, paragraphIndex) => (
    <p key={`${paragraphIndex}-${paragraph.type}`}>
      {paragraph.content.map((node, nodeIndex) => {
        if (node.type === "hardBreak") {
          return <br key={`hard-break-${paragraphIndex}-${nodeIndex}`} />;
        }

        if (node.type === "resumeIcon") {
          return (
            <ResumeInlineIcon
              key={`resume-icon-${paragraphIndex}-${nodeIndex}`}
              iconId={node.attrs.iconId}
            />
          );
        }

        const textNode = <span key={`text-${paragraphIndex}-${nodeIndex}`}>{node.text}</span>;

        if (!node.marks?.length) {
          return textNode;
        }

        return (
          <span key={`marked-text-${paragraphIndex}-${nodeIndex}`}>
            {applyMarks(node.text, node.marks)}
          </span>
        );
      })}
    </p>
  ));
}

interface TextSegmentCursor {
  segments: ResumeDiffTextSegment[];
  segmentIndex: number;
  segmentOffset: number;
}

function takeTextSegments(cursor: TextSegmentCursor, length: number) {
  const result: ResumeDiffTextSegment[] = [];
  let remaining = length;

  while (remaining > 0) {
    const segment = cursor.segments[cursor.segmentIndex];

    if (!segment) break;

    const available = segment.value.length - cursor.segmentOffset;
    const consumed = Math.min(available, remaining);
    const value = segment.value.slice(
      cursor.segmentOffset,
      cursor.segmentOffset + consumed,
    );

    if (value) result.push({ value, changed: segment.changed });

    cursor.segmentOffset += consumed;
    remaining -= consumed;

    if (cursor.segmentOffset >= segment.value.length) {
      cursor.segmentIndex += 1;
      cursor.segmentOffset = 0;
    }
  }

  return result;
}

function getInlineTextAnnotation(annotations: ResumeDiffNodeAnnotation[]) {
  return annotations.find(
    (annotation) => annotation.kind === "changed" && annotation.textSegments,
  );
}

function renderDiffAwareText(
  text: string,
  marks: Parameters<typeof applyMarks>[1] | undefined,
  cursor: TextSegmentCursor | undefined,
  side: ResumeRendererDiffPresentation["side"] | undefined,
  keyPrefix: string,
) {
  if (!cursor || !side) {
    return marks?.length ? applyMarks(text, marks) : text;
  }

  return takeTextSegments(cursor, text.length).map((segment, segmentIndex) => {
    const content = marks?.length
      ? applyMarks(segment.value, marks)
      : segment.value;

    return segment.changed ? (
      <ResumeDiffChangedText
        key={`${keyPrefix}-changed-${segmentIndex}`}
        side={side}
      >
        {content}
      </ResumeDiffChangedText>
    ) : (
      <span key={`${keyPrefix}-unchanged-${segmentIndex}`}>{content}</span>
    );
  });
}

function RichTextView({
  content,
  nodeType = "document",
  nodeId = "",
  field = "",
}: {
  content: RichTextContent;
  nodeType?: "document" | "section" | "block";
  nodeId?: string;
  field?: string;
}) {
  const annotations = useResumeDiffAnnotations(nodeType, nodeId, [field]);
  const annotation = getInlineTextAnnotation(annotations);
  const segmentText = annotation?.textSegments
    ?.map((segment) => segment.value)
    .join("");
  const plainText = getPlainTextFromRichText(content);
  const cursor =
    annotation?.textSegments && segmentText === plainText
      ? {
          segments: annotation.textSegments,
          segmentIndex: 0,
          segmentOffset: 0,
        }
      : undefined;

  return content.content.map((paragraph, paragraphIndex) => {
    const rendered = (
      <p key={`${paragraphIndex}-${paragraph.type}`}>
        {paragraph.content.map((node, nodeIndex) => {
          if (node.type === "hardBreak") {
            if (cursor) takeTextSegments(cursor, 1);
            return <br key={`hard-break-${paragraphIndex}-${nodeIndex}`} />;
          }

          if (node.type === "resumeIcon") {
            return (
              <ResumeInlineIcon
                key={`resume-icon-${paragraphIndex}-${nodeIndex}`}
                iconId={node.attrs.iconId}
              />
            );
          }

          return (
            <span key={`text-${paragraphIndex}-${nodeIndex}`}>
              {renderDiffAwareText(
                node.text,
                node.marks,
                cursor,
                annotation?.side,
                `${paragraphIndex}-${nodeIndex}`,
              )}
            </span>
          );
        })}
      </p>
    );

    if (cursor && paragraphIndex < content.content.length - 1) {
      takeTextSegments(cursor, 1);
    }

    return rendered;
  });
}

function getTextBlockStyle(block: TextBlock): CSSProperties {
  return {
    margin: 0,
    fontSize: block.style?.fontSize,
    fontWeight: block.style?.fontWeight,
    lineHeight: block.style?.lineHeight,
    color: block.style?.color,
    textAlign: block.style?.align,
  };
}

function StyledRichText({ block }: { block: TextBlock }) {
  const annotations = useResumeDiffAnnotations("block", block.id, ["text"]);
  const annotation = getInlineTextAnnotation(annotations);
  const segmentText = annotation?.textSegments
    ?.map((segment) => segment.value)
    .join("");
  const plainText = getPlainTextFromRichText(block.content);
  const cursor =
    annotation?.textSegments && segmentText === plainText
      ? {
          segments: annotation.textSegments,
          segmentIndex: 0,
          segmentOffset: 0,
        }
      : undefined;

  return block.content.content.map((paragraph, paragraphIndex) => (
    <p key={`${block.id}-${paragraphIndex}`} style={getTextBlockStyle(block)}>
      {paragraph.content.map((node, nodeIndex) => {
        if (node.type === "hardBreak") {
          if (cursor) takeTextSegments(cursor, 1);
          return <br key={`hard-break-${block.id}-${nodeIndex}`} />;
        }

        if (node.type === "resumeIcon") {
          return (
            <ResumeInlineIcon
              key={`resume-icon-${block.id}-${nodeIndex}`}
              iconId={node.attrs.iconId}
            />
          );
        }

        return (
          <span key={`${block.id}-text-${nodeIndex}`}>
            {renderDiffAwareText(
              node.text,
              node.marks,
              cursor,
              annotation?.side,
              `${block.id}-${paragraphIndex}-${nodeIndex}`,
            )}
          </span>
        );
      })}
    </p>
  ));
}

function isSelectedBlock(
  selection: ResumeEditorSelection | undefined,
  sectionId: string,
  blockPath: string[],
): boolean {
  if (selection?.sectionId !== sectionId) return false;
  if (!selection.blockPath || selection.blockPath.length !== blockPath.length) {
    return false;
  }

  return selection.blockPath.every((value, index) => value === blockPath[index]);
}

function isSelectedSectionTitle(
  selection: ResumeEditorSelection | undefined,
  sectionId: string,
): boolean {
  return (
    selection?.sectionId === sectionId &&
    selection.richTextField === "title" &&
    !selection.blockPath?.length
  );
}

function isSelectedBadgeItem(
  selection: ResumeEditorSelection | undefined,
  sectionId: string,
  blockPath: string[],
  itemId: string,
) {
  return (
    isSelectedBlock(selection, sectionId, blockPath) &&
    selection?.badgeItemId === itemId
  );
}

function renderSelectedEditorShell(params: {
  shellTestId: string;
  placeholderTestId: string;
  placeholder: ReactNode;
  editor: ReactNode;
  styles: ResumeRendererStyles;
}) {
  return (
    <div className={params.styles.textEditorShell} data-testid={params.shellTestId}>
      <div
        aria-hidden="true"
        className={params.styles.textEditorPlaceholder}
        data-testid={params.placeholderTestId}
      >
        {params.placeholder}
      </div>
      {params.editor}
    </div>
  );
}

function renderSectionTitle(
  section: ResumeDocument["sections"][number],
  context: {
    t: Translator;
    mode: ResumeRendererProps["mode"];
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    selection?: ResumeEditorSelection;
    styles: ResumeRendererStyles;
    onSelectBlock?: ResumeRendererProps["onSelectBlock"];
    onChangeSectionTitle?: ResumeRendererProps["onChangeSectionTitle"];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  if (!section.title) {
    return null;
  }

  const plainText = getPlainTextFromRichText(section.title);
  const titleColor = section.titleStyle?.color ?? "var(--resume-accent)";
  const titleFontSize = section.titleStyle?.fontSize ?? 24;
  const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: titleFontSize,
    fontWeight: 700,
    color: titleColor,
    letterSpacing: "-0.02em",
  };
  const selected = isSelectedSectionTitle(context.selection, section.id);

  if (context.mode === "edit" && context.editSurfaceMode === "content") {
    return (
      <header
        className={context.styles.sectionTitle}
        data-resume-section-title="true"
        style={{ color: titleColor, fontSize: titleFontSize }}
      >
        {selected ? (
          renderSelectedEditorShell({
            shellTestId: `selected-editor-shell-${section.id}-title`,
            placeholderTestId: `selected-editor-placeholder-${section.id}-title`,
            placeholder: renderRichText(section.title),
            editor: (
              <TiptapTextBlockEditor
                ref={context.textEditorRef}
                ariaLabel={context.t("editor.textBlockEditor")}
                className={context.styles.textEditor}
                content={section.title}
                inlineToolbarLabels={getInlineToolbarLabels(context.t)}
                style={titleStyle}
                wrapperClassName={context.styles.textEditorOverlay}
                onChange={(content) =>
                  context.onChangeSectionTitle?.({
                    sectionId: section.id,
                    content,
                  })
                }
                onFormattingStateChange={context.onTextEditorFormattingStateChange}
              />
            ),
            styles: context.styles,
          })
        ) : (
          <button
            type="button"
            aria-label={context.t("renderer.editSectionTitle", {
              title: plainText,
            })}
            className={context.styles.editableTextButton}
            onClick={() =>
              context.onSelectBlock?.({
                sectionId: section.id,
                richTextField: "title",
              })
            }
          >
            <div>
              <RichTextView
                content={section.title}
                nodeType="section"
                nodeId={section.id}
                field="title"
              />
            </div>
          </button>
        )}
      </header>
    );
  }

  return (
    <ResumeDiffTarget
      nodeType="section"
      nodeId={section.id}
      fields={["title", "titleStyle.color", "titleStyle.fontSize"]}
    >
      <header
        className={context.styles.sectionTitle}
        data-resume-section-title="true"
        style={{ color: titleColor, fontSize: titleFontSize }}
      >
        <RichTextView
          content={section.title}
          nodeType="section"
          nodeId={section.id}
          field="title"
        />
      </header>
    </ResumeDiffTarget>
  );
}

function renderTextBlock(
  block: TextBlock,
  context: {
    t: Translator;
    mode: ResumeRendererProps["mode"];
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    sectionId: string;
    blockPath: string[];
    selection?: ResumeEditorSelection;
    styles: ResumeRendererStyles;
    onSelectBlock?: ResumeRendererProps["onSelectBlock"];
    onChangeTextBlock?: ResumeRendererProps["onChangeTextBlock"];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  const selected = isSelectedBlock(
    context.selection,
    context.sectionId,
    context.blockPath,
  );
  const plainText = getPlainTextFromRichText(block.content);

  if (context.mode === "edit" && context.editSurfaceMode === "content") {
    if (selected) {
      return renderSelectedEditorShell({
        shellTestId: `selected-editor-shell-${context.sectionId}-${block.id}`,
        placeholderTestId: `selected-editor-placeholder-${context.sectionId}-${block.id}`,
        placeholder: <StyledRichText block={block} />,
        editor: (
          <TiptapTextBlockEditor
            ref={context.textEditorRef}
            ariaLabel={context.t("editor.textBlockEditor")}
            className={context.styles.textEditor}
            content={block.content}
            inlineToolbarLabels={getInlineToolbarLabels(context.t)}
            style={getTextBlockStyle(block)}
            wrapperClassName={context.styles.textEditorOverlay}
            onChange={(content) =>
              context.onChangeTextBlock?.({
                sectionId: context.sectionId,
                blockPath: context.blockPath,
                content,
              })
            }
            onFormattingStateChange={context.onTextEditorFormattingStateChange}
          />
        ),
        styles: context.styles,
      });
    }

    return (
      <button
        type="button"
        aria-label={plainText}
        className={context.styles.editableTextButton}
        onClick={() =>
          context.onSelectBlock?.({
            sectionId: context.sectionId,
            blockPath: context.blockPath,
            richTextField: "content",
          })
        }
      >
        <div className={selected ? context.styles.selectedEditableText : undefined}>
          <StyledRichText block={block} />
        </div>
      </button>
    );
  }

  return (
    <div>
      <StyledRichText block={block} />
    </div>
  );
}

function getListItemDragLabel(item: ResumeListItem, t: Translator) {
  const firstChild = item.children[0];

  return firstChild ? getBlockDragLabel(firstChild, t) : t("renderer.listItem");
}

function SortableListItem({
  item,
  itemPath,
  marginBottom,
  sectionId,
  styles,
  t,
  onSelectBlock,
  children,
}: {
  item: ResumeListItem;
  itemPath: string[];
  marginBottom: number;
  sectionId: string;
  styles: ResumeRendererStyles;
  t: Translator;
  onSelectBlock?: ResumeRendererProps["onSelectBlock"];
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    isDragging,
    isOver,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  const over = isOver && !isDragging;
  const firstChild = item.children[0];

  return (
    <li
      ref={setNodeRef}
      className={`${styles.listItem} ${styles.sortableBlockItem}`}
      style={{
        ...getSortableItemStyle({ transform, transition }),
        marginBottom,
      }}
      data-resume-dragging={isDragging}
      data-resume-drag-mode="handle"
      data-resume-edit-surface-mode="layout"
      data-resume-list-item-path={serializeBlockPath(itemPath)}
      data-resume-over={over}
      data-testid={`resume-list-item-${itemPath.join("-")}`}
    >
      <div
        aria-hidden="true"
        className={styles.sortableBlockChrome}
        data-resume-dragging={isDragging}
        data-resume-handle-placement="inset"
        data-resume-over={over}
        data-resume-sort-chrome="true"
        data-testid={`resume-list-item-sort-chrome-${itemPath.join("-")}`}
      />
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("renderer.dragListItem", {
          label: getListItemDragLabel(item, t),
        })}
        className={styles.blockDragHandle}
        data-resume-handle-placement="inset"
        {...attributes}
        {...listeners}
        onClick={() => {
          if (!firstChild) return;

          onSelectBlock?.({
            sectionId,
            blockPath: [...itemPath, firstChild.id],
          });
        }}
      >
        ⋮⋮
      </button>
      {children}
    </li>
  );
}

function SortableListContext({
  sectionId,
  listPath,
  itemIds,
  allItemIds,
  onMoveBlock,
  children,
}: {
  sectionId: string;
  listPath: string[];
  itemIds: string[];
  allItemIds: string[];
  onMoveBlock: NonNullable<ResumeRendererProps["onMoveBlock"]>;
  children: ReactNode;
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

  function handleDragEnd(event: DragEndEvent) {
    const move = resolveBlockMoveFromDrag({
      sectionId,
      parentPath: listPath,
      childIds: allItemIds,
      activeId: String(event.active.id),
      overId: event.over?.id ? String(event.over.id) : undefined,
    });

    if (move) {
      onMoveBlock(move);
    }
  }

  return (
    <DndContext
      id={`resume-list-item-sort-${sectionId}-${listPath.join("-")}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function renderListBlock(
  block: ListBlock,
  context: Pick<
    ResumeRendererProps,
    "mode" | "selection" | "onSelectBlock" | "onChangeTextBlock" | "onMoveBlock"
  > & {
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    t: Translator;
    sectionId: string;
    blockPath: string[];
    styles: ResumeRendererStyles;
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
    section?: ResumeDocument["sections"][number];
  },
  fragment?: ResumePageFragment,
): ReactNode {
  const ListTag = block.ordered ? "ol" : "ul";
  const listStyleType = block.ordered
    ? "decimal"
    : block.marker === "square"
      ? "square"
      : block.marker === "dash"
        ? '"- "'
      : block.marker === "none"
        ? "none"
        : "disc";
  const renderedItems = fragment?.children?.length
    ? fragment.children.flatMap((itemFragment) => {
        const itemId = itemFragment.path.at(-1);
        const item = block.items.find((candidate) => candidate.id === itemId);

        return item ? [{ item, fragment: itemFragment }] : [];
      })
    : block.items.map((item) => ({ item, fragment: undefined }));
  const orderedStart = block.ordered
    ? Math.max(
        1,
        block.items.findIndex(
          (item) => item.id === renderedItems[0]?.item.id,
        ) + 1,
      )
    : undefined;
  const sortableEnabled =
    !fragment &&
    context.mode === "edit" &&
    context.editSurfaceMode === "layout" &&
    Boolean(context.onMoveBlock) &&
    block.items.length > 1;
  const itemIds = renderedItems.map(({ item }) => item.id);
  const list = (
    <ListTag
      className={`${context.styles.list} ${context.styles.sortableBlockStack}`}
      data-resume-sort-layer={sortableEnabled ? "idle" : "none"}
      style={{ listStyleType }}
      start={orderedStart}
    >
      {renderedItems.map(({ item, fragment: itemFragment }) => {
        const itemPath = [...context.blockPath, item.id];
        const itemContent = itemFragment?.children?.length && context.section ? (
              <div
                className={context.styles.group}
                style={{ gap: DEFAULT_BLOCK_GAP_PX }}
              >
                {itemFragment.children.map((childFragment) =>
                  renderBlockFragment(
                    context.section!,
                    childFragment,
                    context.styles,
                    context,
                  ),
                )}
              </div>
            ) : (
              <SortableBlockChildren
                blocks={item.children}
                sectionId={context.sectionId}
                parentPath={[...context.blockPath, item.id]}
                t={context.t}
                axis="vertical"
                className={context.styles.group}
                style={{ gap: DEFAULT_BLOCK_GAP_PX }}
                mode={context.mode}
                editSurfaceMode={context.editSurfaceMode}
                selection={context.selection}
                styles={context.styles}
                onSelectBlock={context.onSelectBlock}
                onChangeTextBlock={context.onChangeTextBlock}
                onMoveBlock={context.onMoveBlock}
                textEditorRef={context.textEditorRef}
                onTextEditorFormattingStateChange={
                  context.onTextEditorFormattingStateChange
                }
                allowSelectionHandle={false}
              />
            );

        return (
          <ResumeDiffTarget
            key={item.id}
            nodeType="listItem"
            nodeId={item.id}
            fields={["node", "order"]}
          >
            {sortableEnabled ? (
              <SortableListItem
                item={item}
                itemPath={itemPath}
                marginBottom={block.gap ?? 8}
                sectionId={context.sectionId}
                styles={context.styles}
                t={context.t}
                onSelectBlock={context.onSelectBlock}
              >
                {itemContent}
              </SortableListItem>
            ) : (
              <li
                className={context.styles.listItem}
                style={{
                  marginBottom: block.gap ?? 8,
                  ...(itemFragment?.continuation ? { listStyleType: "none" } : {}),
                }}
                data-resume-list-continuation={
                  itemFragment?.continuation ? "true" : undefined
                }
                data-resume-list-item-path={serializeBlockPath(itemPath)}
              >
                {itemContent}
              </li>
            )}
          </ResumeDiffTarget>
        );
      })}
    </ListTag>
  );

  if (!sortableEnabled || !context.onMoveBlock) {
    return list;
  }

  return (
    <SortableListContext
      sectionId={context.sectionId}
      listPath={context.blockPath}
      itemIds={itemIds}
      allItemIds={block.items.map((item) => item.id)}
      onMoveBlock={context.onMoveBlock}
    >
      {list}
    </SortableListContext>
  );
}

function renderBadgeBlock(
  block: BadgeBlock,
  context: {
    t: Translator;
    mode: ResumeRendererProps["mode"];
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    sectionId: string;
    blockPath: string[];
    selection?: ResumeEditorSelection;
    styles: ResumeRendererStyles;
    onSelectBlock?: ResumeRendererProps["onSelectBlock"];
  },
): ReactNode {
  return (
    <div
      className={context.styles.badges}
      style={{
        flexWrap: block.wrap ? "wrap" : "nowrap",
        gap: block.gap ?? 8,
      }}
    >
      {block.items.map((item) => {
        const selected = isSelectedBadgeItem(
          context.selection,
          context.sectionId,
          context.blockPath,
          item.id,
        );
        const className = `${context.styles.badge}${
          selected ? ` ${context.styles.selectedBadge}` : ""
        }`;

        if (context.mode === "edit" && context.editSurfaceMode === "content") {
          return (
            <ResumeDiffTarget
              key={item.id}
              nodeType="badge"
              nodeId={item.id}
              fields={["node", "text", "order"]}
            >
              <button
                type="button"
                aria-label={context.t("renderer.editBadge", {
                  label: item.text,
                })}
                className={`${className} ${context.styles.editableBadge}`}
                onClick={() =>
                  context.onSelectBlock?.({
                    sectionId: context.sectionId,
                    blockPath: context.blockPath,
                    badgeItemId: item.id,
                  })
                }
              >
                {item.text}
              </button>
            </ResumeDiffTarget>
          );
        }

        return (
          <ResumeDiffTarget
            key={item.id}
            nodeType="badge"
            nodeId={item.id}
            fields={["node", "text", "order"]}
          >
            <span className={className}>{item.text}</span>
          </ResumeDiffTarget>
        );
      })}
    </div>
  );
}

function mapAlign(
  align?: "start" | "center" | "end" | "stretch",
): CSSProperties["alignItems"] {
  if (align === "start") return "flex-start";
  if (align === "end") return "flex-end";
  return align;
}

function mapJustify(
  justify?: "start" | "between" | "end",
): CSSProperties["justifyContent"] {
  if (justify === "start") return "flex-start";
  if (justify === "between") return "space-between";
  if (justify === "end") return "flex-end";
  return undefined;
}

function getSectionBlockStackStyle(
  section: ResumeDocument["sections"][number],
): CSSProperties {
  if ((section.layout?.columns ?? 1) > 1) {
    return {
      display: "grid",
      gridTemplateColumns: `repeat(${section.layout?.columns}, minmax(0, 1fr))`,
      gap: section.layout?.gap,
      alignItems: "start",
    };
  }

  return {
    display: "flex",
    flexDirection: section.layout?.direction === "horizontal" ? "row" : "column",
    gap: section.layout?.gap,
  };
}

function getSectionContainerStyle(
  section: ResumeDocument["sections"][number],
): CSSProperties {
  return {
    paddingTop: section.layout?.padding?.top,
    paddingRight: section.layout?.padding?.right,
    paddingBottom: section.layout?.padding?.bottom,
    paddingLeft: section.layout?.padding?.left,
  };
}

function getGroupBlockStyle(block: GroupBlock): CSSProperties {
  return {
    flexDirection: block.direction === "horizontal" ? "row" : "column",
    gap: block.gap ?? DEFAULT_BLOCK_GAP_PX,
    alignItems: mapAlign(block.align),
  };
}

function getRowBlockStyle(block: RowBlock): CSSProperties {
  return {
    gap: block.gap ?? DEFAULT_BLOCK_GAP_PX,
    alignItems: mapAlign(block.align),
    justifyContent: mapJustify(block.justify),
  };
}

function getSortableStrategy(axis: SortableBlockAxis) {
  if (axis === "horizontal") {
    return horizontalListSortingStrategy;
  }

  if (axis === "grid") {
    return rectSortingStrategy;
  }

  return verticalListSortingStrategy;
}

function getSortableItemStyle(params: {
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

function getBlockDragLabel(block: ResumeBlock, t: Translator) {
  switch (block.type) {
    case "text":
      return getPlainTextFromRichText(block.content) || t("renderer.textBlock");
    case "list":
      return t("renderer.listBlock");
    case "badges":
      return t("renderer.badgesBlock");
    case "group":
      return t("renderer.groupBlock");
    case "row":
      return t("renderer.rowBlock");
  }
}

function shouldUseFloatingSortHandle(block: ResumeBlock, blockPath: string[]) {
  if (block.type === "group" || block.type === "row") {
    return true;
  }

  return blockPath.length <= 2;
}

function SortableBlockItem({
  block,
  sectionId,
  blockPath,
  draggable = true,
  mode,
  editSurfaceMode,
  selection,
  styles,
  onSelectBlock,
  onChangeTextBlock,
  onMoveBlock,
  textEditorRef,
  onTextEditorFormattingStateChange,
}: {
  block: ResumeBlock;
  sectionId: string;
  blockPath: string[];
  draggable?: boolean;
  mode: ResumeRendererProps["mode"];
  editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
  selection?: ResumeEditorSelection;
  styles: ResumeRendererStyles;
  onSelectBlock?: ResumeRendererProps["onSelectBlock"];
  onChangeTextBlock?: ResumeRendererProps["onChangeTextBlock"];
  onMoveBlock?: ResumeRendererProps["onMoveBlock"];
  textEditorRef?: ResumeRendererProps["textEditorRef"];
  onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
}) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    isDragging,
    isOver,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id, disabled: !draggable });
  const dragLabel = getBlockDragLabel(block, t);
  const usesFloatingHandle = shouldUseFloatingSortHandle(block, blockPath);
  const handlePlacement = usesFloatingHandle ? "floating" : "inset";
  const over = isOver && !isDragging;
  const handleEnabled = draggable || Boolean(onSelectBlock);

  return (
    <ResumeDiffTarget
      nodeType="block"
      nodeId={block.id}
      fields={["node", "text", "style", "layout", "order"]}
    >
      <div
        ref={setNodeRef}
        className={styles.sortableBlockItem}
        style={getSortableItemStyle({ transform, transition })}
        data-resume-dragging={isDragging}
        data-testid={`resume-block-item-${blockPath.join("-")}`}
        data-resume-block-path={serializeBlockPath(blockPath)}
        data-resume-drag-mode={draggable ? "handle" : "none"}
        data-resume-edit-surface-mode={editSurfaceMode}
        data-resume-over={over}
      >
        {draggable ? (
          <div
            aria-hidden="true"
            className={styles.sortableBlockChrome}
            data-resume-dragging={isDragging}
            data-resume-handle-placement={handlePlacement}
            data-resume-over={over}
            data-resume-sort-chrome="true"
            data-testid={`resume-sort-chrome-${blockPath.join("-")}`}
          />
        ) : null}
        {handleEnabled ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={t(draggable ? "renderer.dragLabel" : "renderer.selectLabel", {
              label: dragLabel,
            })}
            className={styles.blockDragHandle}
            data-resume-handle-placement={handlePlacement}
            {...(draggable ? attributes : {})}
            {...(draggable ? listeners : {})}
            onClick={() => onSelectBlock?.({ sectionId, blockPath })}
          >
            ⋮⋮
          </button>
        ) : null}
        {renderBlock(block, styles, {
          t,
          mode,
          editSurfaceMode,
          selection,
          onSelectBlock,
          onChangeTextBlock,
          onMoveBlock,
          textEditorRef,
          onTextEditorFormattingStateChange,
          sectionId,
          blockPath,
        })}
      </div>
    </ResumeDiffTarget>
  );
}

function SortableBlockChildren({
  blocks,
  sectionId,
  parentPath,
  t,
  axis,
  className,
  style,
  mode,
  editSurfaceMode,
  selection,
  styles,
  onSelectBlock,
  onChangeTextBlock,
  onMoveBlock,
  textEditorRef,
  onTextEditorFormattingStateChange,
  dataResumeBlockStack,
  dataTestId,
  allowSelectionHandle = true,
}: {
  blocks: ResumeBlock[];
  sectionId: string;
  parentPath: string[];
  t: Translator;
  axis: SortableBlockAxis;
  className: string;
  style?: CSSProperties;
  mode: ResumeRendererProps["mode"];
  editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
  selection?: ResumeEditorSelection;
  styles: ResumeRendererStyles;
  onSelectBlock?: ResumeRendererProps["onSelectBlock"];
  onChangeTextBlock?: ResumeRendererProps["onChangeTextBlock"];
  onMoveBlock?: ResumeRendererProps["onMoveBlock"];
  textEditorRef?: ResumeRendererProps["textEditorRef"];
  onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  dataResumeBlockStack?: string;
  dataTestId?: string;
  allowSelectionHandle?: boolean;
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
  const childIds = blocks.map((block) => block.id);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sortableEnabled =
    mode === "edit" &&
    editSurfaceMode === "layout" &&
    Boolean(onMoveBlock) &&
    blocks.length > 1;
  const layoutHandleEnabled =
    mode === "edit" &&
    editSurfaceMode === "layout" &&
    ((allowSelectionHandle && Boolean(onSelectBlock)) || sortableEnabled);
  const content = blocks.map((block) => {
    const blockPath = [...parentPath, block.id];

    if (!layoutHandleEnabled) {
      return (
        <ResumeDiffTarget
          key={block.id}
          nodeType="block"
          nodeId={block.id}
          fields={["node", "text", "style", "layout", "order"]}
        >
          <div
            data-testid={`resume-block-item-${blockPath.join("-")}`}
            data-resume-block-path={serializeBlockPath(blockPath)}
            data-resume-drag-mode="none"
          >
            {renderBlock(block, styles, {
              t,
              mode,
              editSurfaceMode,
              selection,
              onSelectBlock,
              onChangeTextBlock,
              onMoveBlock,
              textEditorRef,
              onTextEditorFormattingStateChange,
              sectionId,
              blockPath,
            })}
          </div>
        </ResumeDiffTarget>
      );
    }

    return (
      <SortableBlockItem
        key={block.id}
        block={block}
        sectionId={sectionId}
        blockPath={blockPath}
        draggable={sortableEnabled}
        mode={mode}
        editSurfaceMode={editSurfaceMode}
        selection={selection}
        styles={styles}
        onSelectBlock={onSelectBlock}
        onChangeTextBlock={onChangeTextBlock}
        onMoveBlock={onMoveBlock}
        textEditorRef={textEditorRef}
        onTextEditorFormattingStateChange={onTextEditorFormattingStateChange}
      />
    );
  });

  if (!layoutHandleEnabled) {
    return (
      <div
        className={className}
        style={style}
        data-resume-block-stack={dataResumeBlockStack}
        data-resume-sort-layer="none"
        data-testid={dataTestId}
      >
        {content}
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);

    const move = resolveBlockMoveFromDrag({
      sectionId,
      parentPath,
      childIds,
      activeId: String(event.active.id),
      overId: event.over?.id ? String(event.over.id) : undefined,
    });

    if (!move || !onMoveBlock) {
      return;
    }

    onMoveBlock(move);
  }

  return (
    <DndContext
      id={`resume-block-sort-${sectionId}-${parentPath.join("-") || "root"}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => {
        setActiveDragId(String(event.active.id));
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDragId(null);
      }}
    >
      <SortableContext items={childIds} strategy={getSortableStrategy(axis)}>
        <div
          className={[className, styles.sortableBlockStack]
            .filter(Boolean)
            .join(" ")}
          style={style}
          data-resume-block-stack={dataResumeBlockStack}
          data-resume-sort-layer={activeDragId ? "active" : "idle"}
          data-testid={dataTestId}
        >
          {content}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function renderGroupBlock(
  block: GroupBlock,
  styles: ResumeRendererStyles,
  context: Pick<
    ResumeRendererProps,
    "mode" | "selection" | "onSelectBlock" | "onChangeTextBlock" | "onMoveBlock"
  > & {
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    t: Translator;
    sectionId: string;
    blockPath: string[];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  return (
    <SortableBlockChildren
      blocks={block.children}
      sectionId={context.sectionId}
      parentPath={context.blockPath}
      t={context.t}
      axis={block.direction === "horizontal" ? "horizontal" : "vertical"}
      className={styles.group}
      style={getGroupBlockStyle(block)}
      mode={context.mode}
      editSurfaceMode={context.editSurfaceMode}
      selection={context.selection}
      styles={styles}
      onSelectBlock={context.onSelectBlock}
      onChangeTextBlock={context.onChangeTextBlock}
      onMoveBlock={context.onMoveBlock}
      textEditorRef={context.textEditorRef}
      onTextEditorFormattingStateChange={context.onTextEditorFormattingStateChange}
    />
  );
}

function renderRowBlock(
  block: RowBlock,
  styles: ResumeRendererStyles,
  context: Pick<
    ResumeRendererProps,
    "mode" | "selection" | "onSelectBlock" | "onChangeTextBlock" | "onMoveBlock"
  > & {
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    t: Translator;
    sectionId: string;
    blockPath: string[];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  return (
    <SortableBlockChildren
      blocks={block.children}
      sectionId={context.sectionId}
      parentPath={context.blockPath}
      t={context.t}
      axis="horizontal"
      className={styles.row}
      style={getRowBlockStyle(block)}
      mode={context.mode}
      editSurfaceMode={context.editSurfaceMode}
      selection={context.selection}
      styles={styles}
      onSelectBlock={context.onSelectBlock}
      onChangeTextBlock={context.onChangeTextBlock}
      onMoveBlock={context.onMoveBlock}
      textEditorRef={context.textEditorRef}
      onTextEditorFormattingStateChange={context.onTextEditorFormattingStateChange}
    />
  );
}

function renderBlock(
  block: ResumeBlock,
  styles: ResumeRendererStyles,
  context: Pick<
    ResumeRendererProps,
    "mode" | "selection" | "onSelectBlock" | "onChangeTextBlock" | "onMoveBlock"
  > & {
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    t: Translator;
    sectionId: string;
    blockPath: string[];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  switch (block.type) {
    case "text":
      return renderTextBlock(block, {
        t: context.t,
        mode: context.mode,
        editSurfaceMode: context.editSurfaceMode,
        sectionId: context.sectionId,
        blockPath: context.blockPath,
        selection: context.selection,
        styles,
        onSelectBlock: context.onSelectBlock,
        onChangeTextBlock: context.onChangeTextBlock,
        textEditorRef: context.textEditorRef,
        onTextEditorFormattingStateChange: context.onTextEditorFormattingStateChange,
      });
    case "list":
      return renderListBlock(block, {
        t: context.t,
        mode: context.mode,
        editSurfaceMode: context.editSurfaceMode,
        selection: context.selection,
        onSelectBlock: context.onSelectBlock,
        onChangeTextBlock: context.onChangeTextBlock,
        onMoveBlock: context.onMoveBlock,
        textEditorRef: context.textEditorRef,
        onTextEditorFormattingStateChange: context.onTextEditorFormattingStateChange,
        sectionId: context.sectionId,
        blockPath: context.blockPath,
        styles,
      });
    case "badges":
      return renderBadgeBlock(block, { ...context, styles });
    case "group":
      return renderGroupBlock(block, styles, context);
    case "row":
      return renderRowBlock(block, styles, context);
  }
}

function createSinglePageLayout(
  sections: ResumeDocument["sections"],
): ResumePageLayout[] {
  return [
    {
      index: 0,
      sectionIds: sections.map((section) => section.id),
      sections: sections.map(createWholeSectionLayout),
      totalHeight: 0,
    },
  ];
}

function areBlockLayoutsEqual(
  current: ResumePageFragment,
  next: ResumePageFragment,
): boolean {
  if (serializeBlockPath(current.path) !== serializeBlockPath(next.path)) {
    return false;
  }

  if (Boolean(current.continuation) !== Boolean(next.continuation)) {
    return false;
  }

  if ((current.children?.length ?? 0) !== (next.children?.length ?? 0)) {
    return false;
  }

  return (
    current.children?.every((child, index) =>
      areBlockLayoutsEqual(child, next.children?.[index] ?? child),
    ) ?? true
  );
}

function arePageLayoutsEqual(
  current: ResumePageLayout[],
  next: ResumePageLayout[],
) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((page, pageIndex) => {
    const nextPage = next[pageIndex];

    if (!nextPage || page.sections.length !== nextPage.sections.length) {
      return false;
    }

    return page.sections.every((section, sectionIndex) => {
      const nextSection = nextPage.sections[sectionIndex];

      if (
        !nextSection ||
        section.sectionId !== nextSection.sectionId ||
        section.includeTitle !== nextSection.includeTitle ||
        section.blocks.length !== nextSection.blocks.length
      ) {
        return false;
      }

      return section.blocks.every((block, blockIndex) =>
        areBlockLayoutsEqual(block, nextSection.blocks[blockIndex]!),
      );
    });
  });
}

function getPageContentHeight(document: ResumeDocument) {
  return Math.max(
    1,
    A4_PAGE_HEIGHT_PX -
      document.settings.page.margin.top -
      document.settings.page.margin.bottom,
  );
}

function isWholeTopLevelBlockLayout(block: ResumePageFragment) {
  return block.path.length === 1 && !block.children?.length;
}

function renderBlockFragment(
  section: ResumeDocument["sections"][number],
  fragment: ResumePageFragment,
  styles: ResumeRendererStyles,
  context: Pick<
    ResumeRendererProps,
    "mode" | "selection" | "onSelectBlock" | "onChangeTextBlock" | "onMoveBlock"
  > & {
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    t: Translator;
    sectionId: string;
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
  },
): ReactNode {
  const block = findBlockByPath(section.blocks, fragment.path);

  if (!block) {
    return null;
  }

  const key = serializeBlockPath(fragment.path);

  if (block.type === "list") {
    return (
      <ResumeDiffTarget
        key={key}
        nodeType="block"
        nodeId={block.id}
        fields={["node", "text", "style", "layout", "order"]}
      >
        <div data-resume-block-path={key}>
          {renderListBlock(
            block,
            {
              t: context.t,
              mode: context.mode,
              editSurfaceMode: context.editSurfaceMode,
              selection: context.selection,
              onSelectBlock: context.onSelectBlock,
              onChangeTextBlock: context.onChangeTextBlock,
              onMoveBlock: context.onMoveBlock,
              textEditorRef: context.textEditorRef,
              onTextEditorFormattingStateChange:
                context.onTextEditorFormattingStateChange,
              sectionId: context.sectionId,
              blockPath: fragment.path,
              styles,
              section,
            },
            fragment,
          )}
        </div>
      </ResumeDiffTarget>
    );
  }

  if (block.type === "group" && fragment.children?.length) {
    return (
      <ResumeDiffTarget
        key={key}
        nodeType="block"
        nodeId={block.id}
        fields={["node", "text", "style", "layout", "order"]}
      >
        <div data-resume-block-path={key}>
          <div className={styles.group} style={getGroupBlockStyle(block)}>
            {fragment.children.map((childFragment) =>
              renderBlockFragment(section, childFragment, styles, context),
            )}
          </div>
        </div>
      </ResumeDiffTarget>
    );
  }

  if (block.type === "row" && fragment.children?.length) {
    return (
      <ResumeDiffTarget
        key={key}
        nodeType="block"
        nodeId={block.id}
        fields={["node", "text", "style", "layout", "order"]}
      >
        <div data-resume-block-path={key}>
          <div className={styles.row} style={getRowBlockStyle(block)}>
            {fragment.children.map((childFragment) =>
              renderBlockFragment(section, childFragment, styles, context),
            )}
          </div>
        </div>
      </ResumeDiffTarget>
    );
  }

  return (
    <ResumeDiffTarget
      key={key}
      nodeType="block"
      nodeId={block.id}
      fields={["node", "text", "style", "layout", "order"]}
    >
      <div data-resume-block-path={key}>
        {renderBlock(block, styles, {
          t: context.t,
          mode: context.mode,
          editSurfaceMode: context.editSurfaceMode,
          selection: context.selection,
          onSelectBlock: context.onSelectBlock,
          onChangeTextBlock: context.onChangeTextBlock,
          onMoveBlock: context.onMoveBlock,
          textEditorRef: context.textEditorRef,
          onTextEditorFormattingStateChange:
            context.onTextEditorFormattingStateChange,
          sectionId: context.sectionId,
          blockPath: fragment.path,
        })}
      </div>
    </ResumeDiffTarget>
  );
}

function measureElementHeight(
  element: HTMLElement | null,
  zoom: number,
) {
  return Math.ceil((element?.getBoundingClientRect().height ?? 0) / zoom);
}

function isStructurallyEmptyBlock(block: ResumeBlock): boolean {
  if (block.type !== "group" && block.type !== "row") {
    return false;
  }

  return block.children.every(isStructurallyEmptyBlock);
}

function calculateWrapperHeight(
  height: number,
  children: MeasuredResumeNode[],
  childGap: number,
) {
  const childrenHeight = children.reduce(
    (total, child, index) =>
      total + child.height + (index > 0 ? childGap : 0),
    0,
  );

  return Math.max(0, height - childrenHeight);
}

function measureResumeBlock(
  rootElement: HTMLElement,
  block: ResumeBlock,
  blockPath: string[],
  zoom: number,
): MeasuredResumeNode | undefined {
  const element = rootElement.querySelector<HTMLElement>(
    `[data-resume-block-path="${serializeBlockPath(blockPath)}"]`,
  );
  const height = measureElementHeight(element, zoom);

  if (!element || (height <= 0 && !isStructurallyEmptyBlock(block))) {
    return undefined;
  }

  if (block.type === "group" && block.direction !== "horizontal") {
    const children = block.children
      .map((child) =>
        measureResumeBlock(rootElement, child, [...blockPath, child.id], zoom),
      )
      .filter((child): child is MeasuredResumeNode => Boolean(child));

    if (children.length !== block.children.length) {
      return undefined;
    }

    const childGap = block.gap ?? DEFAULT_BLOCK_GAP_PX;

    return {
      id: block.id,
      path: blockPath,
      type: "group",
      height,
      direction: block.direction,
      childGap,
      wrapperHeight: calculateWrapperHeight(height, children, childGap),
      children,
    };
  }

  if (block.type === "list") {
    const children = block.items
      .map((item) => {
        const itemPath = [...blockPath, item.id];
        const itemElement = rootElement.querySelector<HTMLElement>(
          `[data-resume-list-item-path="${serializeBlockPath(itemPath)}"]`,
        );
        const itemHeight = measureElementHeight(itemElement, zoom);

        if (itemHeight <= 0) {
          return undefined;
        }

        const itemChildren = item.children
          .map((child) =>
            measureResumeBlock(
              rootElement,
              child,
              [...itemPath, child.id],
              zoom,
            ),
          )
          .filter((child): child is MeasuredResumeNode => Boolean(child));

        const measuredEveryChild = itemChildren.length === item.children.length;

        return {
          id: item.id,
          path: itemPath,
          type: "listItem" as const,
          height: itemHeight,
          direction: "vertical" as const,
          childGap: DEFAULT_BLOCK_GAP_PX,
          wrapperHeight: measuredEveryChild
            ? calculateWrapperHeight(
                itemHeight,
                itemChildren,
                DEFAULT_BLOCK_GAP_PX,
              )
            : itemHeight,
          children: measuredEveryChild ? itemChildren : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (children.length !== block.items.length) {
      return undefined;
    }

    const childGap = block.gap ?? 8;

    return {
      id: block.id,
      path: blockPath,
      type: "list",
      height,
      direction: "vertical",
      childGap,
      wrapperHeight: calculateWrapperHeight(height, children, childGap),
      children,
    };
  }

  return {
    id: block.id,
    path: blockPath,
    type: block.type,
    height,
    ...(block.type === "group" || block.type === "row"
      ? { direction: "horizontal" as const }
      : {}),
  };
}

function measureResumeSection(
  rootElement: HTMLElement,
  section: ResumeDocument["sections"][number],
  zoom: number,
): MeasuredResumeSection | undefined {
  const sectionElement = rootElement.querySelector<HTMLElement>(
    `[data-resume-section-id="${section.id}"]`,
  );
  const titleElement = section.title
    ? sectionElement?.querySelector<HTMLElement>(
        '[data-resume-section-title="true"]',
      ) ?? null
    : null;
  const titleHeight = section.title
    ? measureElementHeight(titleElement, zoom)
    : 0;
  const titleGap = titleElement
    ? Math.max(
        0,
        Number.parseFloat(getComputedStyle(titleElement).marginBottom) / zoom ||
          0,
      )
    : 0;
  const height = measureElementHeight(sectionElement, zoom);
  const blocks = section.blocks
    .map((block) => measureResumeBlock(rootElement, block, [block.id], zoom))
    .filter((block): block is MeasuredResumeNode => Boolean(block));

  if (
    !sectionElement ||
    height <= 0 ||
    blocks.length !== section.blocks.length ||
    (section.title && titleHeight <= 0)
  ) {
    return undefined;
  }

  return {
    id: section.id,
    height,
    titleHeight,
    titleGap,
    keepTogether: section.pagination?.keepTogether,
    topLevelGap: section.layout?.gap ?? DEFAULT_BLOCK_GAP_PX,
    blocks,
  };
}

function renderResumeSection(
  section: ResumeDocument["sections"][number],
  context: {
    t: Translator;
    sectionLayout: ResumePageSectionLayout;
    mode: ResumeRendererProps["mode"];
    editSurfaceMode: NonNullable<ResumeRendererProps["editSurfaceMode"]>;
    selection?: ResumeEditorSelection;
    styles: ResumeRendererStyles;
    onSelectBlock?: ResumeRendererProps["onSelectBlock"];
    onChangeSectionTitle?: ResumeRendererProps["onChangeSectionTitle"];
    onChangeTextBlock?: ResumeRendererProps["onChangeTextBlock"];
    onMoveBlock?: ResumeRendererProps["onMoveBlock"];
    textEditorRef?: ResumeRendererProps["textEditorRef"];
    onTextEditorFormattingStateChange?: ResumeRendererProps["onTextEditorFormattingStateChange"];
    instanceKey: string;
  },
) {
  const renderWholeTopLevelBlocks = context.sectionLayout.blocks.every(
    isWholeTopLevelBlockLayout,
  );
  const sectionBlocks = renderWholeTopLevelBlocks
    ? context.sectionLayout.blocks
        .map((blockLayout) =>
          section.blocks.find((block) => block.id === blockLayout.path[0]),
        )
        .filter((block): block is ResumeBlock => Boolean(block))
    : null;

  return (
    <ResumeDiffTarget
      key={context.instanceKey}
      nodeType="section"
      nodeId={section.id}
      fields={["node", "semantic", "visible", "order", "layout"]}
    >
      <section
        className={context.styles.section}
        style={getSectionContainerStyle(section)}
        data-resume-section-id={section.id}
        data-testid={`resume-section-${section.id}`}
      >
        {context.sectionLayout.includeTitle
          ? renderSectionTitle(section, {
              t: context.t,
              mode: context.mode,
              editSurfaceMode: context.editSurfaceMode,
              selection: context.selection,
              styles: context.styles,
              onSelectBlock: context.onSelectBlock,
              onChangeSectionTitle: context.onChangeSectionTitle,
              textEditorRef: context.textEditorRef,
              onTextEditorFormattingStateChange:
                context.onTextEditorFormattingStateChange,
            })
          : null}

        {renderWholeTopLevelBlocks && sectionBlocks ? (
          <SortableBlockChildren
            blocks={sectionBlocks}
            sectionId={section.id}
            parentPath={[]}
            t={context.t}
            axis={(section.layout?.columns ?? 1) > 1
              ? "grid"
              : section.layout?.direction === "horizontal"
                ? "horizontal"
                : "vertical"}
            className={context.styles.blockStack}
            style={getSectionBlockStackStyle(section)}
            mode={context.mode}
            editSurfaceMode={context.editSurfaceMode}
            selection={context.selection}
            styles={context.styles}
            onSelectBlock={context.onSelectBlock}
            onChangeTextBlock={context.onChangeTextBlock}
            onMoveBlock={context.onMoveBlock}
            textEditorRef={context.textEditorRef}
            onTextEditorFormattingStateChange={
              context.onTextEditorFormattingStateChange
            }
            dataResumeBlockStack={section.id}
            dataTestId={`section-block-stack-${section.id}`}
          />
        ) : (
          <div
            className={context.styles.blockStack}
            style={getSectionBlockStackStyle(section)}
            data-resume-block-stack={section.id}
            data-testid={`section-block-stack-${section.id}`}
          >
            {context.sectionLayout.blocks.map((blockLayout) =>
              renderBlockFragment(section, blockLayout, context.styles, {
                t: context.t,
                mode: context.mode,
                editSurfaceMode: context.editSurfaceMode,
                selection: context.selection,
                onSelectBlock: context.onSelectBlock,
                onChangeTextBlock: context.onChangeTextBlock,
                onMoveBlock: context.onMoveBlock,
                textEditorRef: context.textEditorRef,
                onTextEditorFormattingStateChange:
                  context.onTextEditorFormattingStateChange,
                sectionId: section.id,
              }),
            )}
          </div>
        )}
      </section>
    </ResumeDiffTarget>
  );
}

export function ResumeRenderer({
  document,
  mode,
  editSurfaceMode = "content",
  paginationRevision = 0,
  responsiveView = false,
  showPrintSafeArea = false,
  zoom = 1,
  diffPresentation,
  selection,
  onSelectBlock,
  onChangeSectionTitle,
  onChangeTextBlock,
  onMoveBlock,
  textEditorRef,
  onTextEditorFormattingStateChange,
  onPageCountChange,
  onPaginationReadyChange,
}: ResumeRendererProps) {
  const { styles } = useResumeRendererStyles();
  const { t } = useI18n();
  const styleVariables = getResumeStyleVariables(document);
  const visibleSections = useMemo(
    () => document.sections.filter((section) => section.visible),
    [document.sections],
  );
  const [pageLayouts, setPageLayouts] = useState<ResumePageLayout[]>(() =>
    createSinglePageLayout(visibleSections),
  );
  const [paginationReady, setPaginationReady] = useState(false);
  const [measuredLayoutKey, setMeasuredLayoutKey] = useState("");
  const [layoutRevision, setLayoutRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedTextBlock =
    selection?.sectionId && selection.blockPath
      ? findTextBlock(document, selection.sectionId, selection.blockPath)
      : undefined;
  const pageContentHeight = useMemo(() => getPageContentHeight(document), [document]);
  const sectionMap = useMemo(
    () => new Map(visibleSections.map((section) => [section.id, section])),
    [visibleSections],
  );
  const measurementLayout = useMemo(
    () => createSinglePageLayout(visibleSections),
    [visibleSections],
  );
  const layoutInputKey = useMemo(
    () =>
      JSON.stringify({
        zoom,
        paginationRevision,
        pageContentHeight,
        layoutRevision,
        typography: document.settings.typography,
        sections: visibleSections,
      }),
    [
      document.settings.typography,
      layoutRevision,
      pageContentHeight,
      paginationRevision,
      visibleSections,
      zoom,
    ],
  );
  const isLayoutCurrent = paginationReady && measuredLayoutKey === layoutInputKey;
  const resolvedPageLayouts = isLayoutCurrent ? pageLayouts : measurementLayout;
  const printReady = isLayoutCurrent;

  useEffect(() => {
    onPageCountChange?.(resolvedPageLayouts.length);
  }, [onPageCountChange, resolvedPageLayouts.length]);

  useEffect(() => {
    onPaginationReadyChange?.(isLayoutCurrent);
  }, [isLayoutCurrent, onPaginationReadyChange]);

  useEffect(() => {
    const handleResize = () => {
      setLayoutRevision((current) => current + 1);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (isLayoutCurrent) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (visibleSections.length === 0) {
        if (!arePageLayoutsEqual(pageLayouts, measurementLayout)) {
          setPageLayouts(measurementLayout);
        }
        setPaginationReady(true);
        setMeasuredLayoutKey(layoutInputKey);
        return;
      }

      const rootElement = rootRef.current;

      if (!rootElement) {
        return;
      }

      const measuredSections = visibleSections
        .map((section) => measureResumeSection(rootElement, section, zoom))
        .filter((section): section is MeasuredResumeSection => Boolean(section));

      if (measuredSections.length !== visibleSections.length) {
        return;
      }

      const nextLayouts = paginateMeasuredSections({
        pageHeight: pageContentHeight,
        sectionGap: DEFAULT_SECTION_GAP_PX,
        sections: measuredSections,
      }).pages;

      if (!arePageLayoutsEqual(pageLayouts, nextLayouts)) {
        setPageLayouts(nextLayouts);
      }

      setMeasuredLayoutKey(layoutInputKey);
      setPaginationReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    isLayoutCurrent,
    layoutInputKey,
    layoutRevision,
    measurementLayout,
    pageContentHeight,
    pageLayouts,
    visibleSections,
    zoom,
  ]);

  return (
    <ResumeDiffProvider
      presentation={mode === "print" ? undefined : diffPresentation}
    >
      <div
        ref={rootRef}
        className={styles.root}
        data-resume-mode={mode}
        data-resume-edit-surface-mode={editSurfaceMode}
        data-resume-responsive-view={responsiveView ? "true" : "false"}
        data-resume-pagination-ready={isLayoutCurrent ? "true" : "false"}
        data-resume-pagination-revision={paginationRevision}
      >
        {mode === "print" ? <ResumePrintReadyFlag ready={printReady} /> : null}
        {resolvedPageLayouts.map((page) => (
          <div key={`resume-page-${page.index}`} className={styles.pageFrame}>
            {mode !== "print" ? (
              <div
                className={styles.pageLabel}
                data-print-chrome="screen"
              >
                {t("renderer.pageLabel", { index: page.index + 1 })}
              </div>
            ) : null}
            <article
              className={styles.page}
              style={styleVariables as CSSProperties}
              data-resume-page="true"
              data-resume-page-index={page.index + 1}
              data-testid={`resume-page-${page.index + 1}`}
            >
              {mode === "edit" && showPrintSafeArea ? (
                <div
                  aria-hidden="true"
                  className={styles.printSafeArea}
                  data-resume-print-safe-area="true"
                />
              ) : null}
              <div className={styles.pageContent}>
                {page.sections.map((sectionLayout, sectionIndex) => {
                  const section = sectionMap.get(sectionLayout.sectionId);

                  if (!section) {
                    return null;
                  }

                  return renderResumeSection(section, {
                    t,
                    sectionLayout,
                    mode,
                    editSurfaceMode,
                    selection,
                    styles,
                    onSelectBlock,
                    onChangeSectionTitle,
                    onChangeTextBlock,
                    onMoveBlock,
                    textEditorRef,
                    onTextEditorFormattingStateChange,
                    instanceKey: `page-${page.index}-${sectionLayout.sectionId}-${sectionIndex}`,
                  });
                })}
              </div>
            </article>
          </div>
        ))}
        {mode === "edit" && selectedTextBlock ? null : null}
      </div>
    </ResumeDiffProvider>
  );
}
