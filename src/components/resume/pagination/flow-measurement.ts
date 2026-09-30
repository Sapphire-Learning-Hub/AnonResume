import type { TiptapTextBlockEditorHandle } from "@/components/resume/TiptapTextBlockEditor";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { RichTextPosition } from "@/domain/resume/page-flow/rich-text-range";
import type {
  MeasuredResumeNode,
  MeasuredResumeSection,
  MeasuredRichTextLine,
} from "@/domain/resume/pagination";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";

const BLOCK_PATH_SEPARATOR = "::";
const DEFAULT_BLOCK_GAP_PX = 10;
const STATIC_LINE_TOLERANCE_PX = 1;

export interface MeasureResumeFlowParams {
  root: HTMLElement;
  document: ResumeDocument;
  zoom: number;
  activeEditor?: TiptapTextBlockEditorHandle | null;
  activeSelection?: ResumeEditorSelection;
  committedSpacerHeights: ReadonlyMap<string, number>;
}

interface StaticBoundary {
  position: RichTextPosition;
  rect: Pick<DOMRect, "top" | "bottom">;
}

function serializeBlockPath(path: string[]) {
  return path.join(BLOCK_PATH_SEPARATOR);
}

function findElementByData(
  root: HTMLElement,
  attribute: string,
  value: string,
) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`[${attribute}]`),
  ).find((element) => element.getAttribute(attribute) === value);
}

function getCommittedSpacerHeight(
  element: HTMLElement,
  committedSpacerHeights: ReadonlyMap<string, number>,
) {
  const ids = new Set(
    Array.from(
      element.querySelectorAll<HTMLElement>("[data-resume-page-break-id]"),
    ).flatMap((spacer) =>
      spacer.dataset.resumePageBreakId
        ? [spacer.dataset.resumePageBreakId]
        : [],
    ),
  );

  return Array.from(ids).reduce(
    (total, id) => total + (committedSpacerHeights.get(id) ?? 0),
    0,
  );
}

function measureElementHeight(
  element: HTMLElement | undefined,
  zoom: number,
  committedSpacerHeights: ReadonlyMap<string, number>,
) {
  if (!element || zoom <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(element.getBoundingClientRect().height / zoom) -
      getCommittedSpacerHeight(element, committedSpacerHeights),
  );
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

function pathsEqual(current: string[] | undefined, target: string[]) {
  return (
    current?.length === target.length &&
    current.every((segment, index) => segment === target[index])
  );
}

function findTextNodeAtOffset(element: HTMLElement, targetOffset: number) {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let traversed = 0;
  let lastTextNode: Text | undefined;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const length = textNode.data.length;
    lastTextNode = textNode;

    if (targetOffset <= traversed + length) {
      return {
        node: textNode,
        offset: Math.max(0, targetOffset - traversed),
      };
    }

    traversed += length;
  }

  return lastTextNode
    ? { node: lastTextNode, offset: lastTextNode.data.length }
    : undefined;
}

function measureCollapsedRange(
  element: HTMLElement,
  offset: number,
): Pick<DOMRect, "top" | "bottom"> | undefined {
  const boundary = findTextNodeAtOffset(element, offset);

  if (!boundary) {
    return undefined;
  }

  const range = element.ownerDocument.createRange();
  range.setStart(boundary.node, boundary.offset);
  range.setEnd(boundary.node, boundary.offset);
  range.collapse(true);
  return range.getBoundingClientRect();
}

function measureAtomicBoundary(
  element: HTMLElement,
  after: boolean,
): Pick<DOMRect, "top" | "bottom"> {
  const range = element.ownerDocument.createRange();

  if (after) {
    range.setStartAfter(element);
  } else {
    range.setStartBefore(element);
  }

  range.collapse(true);
  return range.getBoundingClientRect();
}

function listStaticRichTextBoundaries(blockElement: HTMLElement) {
  const nodes = Array.from(
    blockElement.querySelectorAll<HTMLElement>(
      "[data-resume-rich-paragraph-index][data-resume-rich-node-index][data-resume-rich-node-type]",
    ),
  );
  const boundaries: StaticBoundary[] = [];

  for (const element of nodes) {
    const paragraphIndex = Number(element.dataset.resumeRichParagraphIndex);
    const nodeIndex = Number(element.dataset.resumeRichNodeIndex);
    const nodeType = element.dataset.resumeRichNodeType;

    if (!Number.isInteger(paragraphIndex) || !Number.isInteger(nodeIndex)) {
      return undefined;
    }

    const length = nodeType === "text" ? element.textContent?.length ?? 0 : 1;

    for (let offset = 0; offset <= length; offset += 1) {
      const rect =
        nodeType === "text"
          ? measureCollapsedRange(element, offset)
          : measureAtomicBoundary(element, offset === 1);

      if (!rect) {
        return undefined;
      }

      const previous = boundaries.at(-1);
      const position = { paragraphIndex, nodeIndex, offset };

      if (
        previous &&
        previous.position.paragraphIndex === position.paragraphIndex &&
        previous.position.nodeIndex === position.nodeIndex &&
        previous.position.offset === position.offset
      ) {
        continue;
      }

      boundaries.push({ position, rect });
    }
  }

  return boundaries;
}

function boundariesToLines(
  boundaries: StaticBoundary[],
  zoom: number,
): MeasuredRichTextLine[] {
  if (boundaries.length < 2) {
    return [];
  }

  const lines: MeasuredRichTextLine[] = [];
  let lineStart = boundaries[0]!;
  let lineBottom = lineStart.rect.bottom;

  for (let index = 1; index < boundaries.length; index += 1) {
    const current = boundaries[index]!;

    if (
      Math.abs(current.rect.top - lineStart.rect.top) >
      STATIC_LINE_TOLERANCE_PX
    ) {
      lines.push({
        from: lineStart.position,
        to: current.position,
        height: Math.max(
          1,
          Math.ceil((lineBottom - lineStart.rect.top) / zoom),
        ),
      });
      lineStart = current;
      lineBottom = current.rect.bottom;
    } else {
      lineBottom = Math.max(lineBottom, current.rect.bottom);
    }
  }

  const last = boundaries.at(-1)!;

  if (
    lineStart.position.paragraphIndex !== last.position.paragraphIndex ||
    lineStart.position.nodeIndex !== last.position.nodeIndex ||
    lineStart.position.offset !== last.position.offset
  ) {
    lines.push({
      from: lineStart.position,
      to: last.position,
      height: Math.max(
        1,
        Math.ceil((lineBottom - lineStart.rect.top) / zoom),
      ),
    });
  }

  return lines;
}

function measureStaticRichTextLines(
  blockElement: HTMLElement,
  zoom: number,
) {
  try {
    const boundaries = listStaticRichTextBoundaries(blockElement);
    return boundaries ? boundariesToLines(boundaries, zoom) : undefined;
  } catch {
    return undefined;
  }
}

function getTextMeasurements(params: {
  element: HTMLElement;
  height: number;
  zoom: number;
  sectionId: string;
  blockPath: string[];
  activeEditor?: TiptapTextBlockEditorHandle | null;
  activeSelection?: ResumeEditorSelection;
}) {
  const selected =
    params.activeSelection?.sectionId === params.sectionId &&
    params.activeSelection.richTextField === "content" &&
    pathsEqual(params.activeSelection.blockPath, params.blockPath);
  const textLines = selected
    ? params.activeEditor?.measureRichTextLines()
    : measureStaticRichTextLines(params.element, params.zoom);

  if (!textLines) {
    return {};
  }

  const lineHeight = textLines.reduce((total, line) => total + line.height, 0);

  return {
    textLines,
    leadingHeight: 0,
    trailingHeight: Math.max(0, params.height - lineHeight),
  };
}

function measureResumeBlock(params: {
  root: HTMLElement;
  block: ResumeBlock;
  blockPath: string[];
  sectionId: string;
  zoom: number;
  activeEditor?: TiptapTextBlockEditorHandle | null;
  activeSelection?: ResumeEditorSelection;
  committedSpacerHeights: ReadonlyMap<string, number>;
}): MeasuredResumeNode | undefined {
  const element = findElementByData(
    params.root,
    "data-resume-block-path",
    serializeBlockPath(params.blockPath),
  );
  const height = measureElementHeight(
    element,
    params.zoom,
    params.committedSpacerHeights,
  );

  if (!element || (height <= 0 && !isStructurallyEmptyBlock(params.block))) {
    return undefined;
  }

  if (params.block.type === "group" && params.block.direction !== "horizontal") {
    const children = params.block.children.map((child) =>
      measureResumeBlock({
        ...params,
        block: child,
        blockPath: [...params.blockPath, child.id],
      }),
    );

    if (children.some((child) => !child)) {
      return undefined;
    }

    const measuredChildren = children as MeasuredResumeNode[];
    const childGap = params.block.gap ?? DEFAULT_BLOCK_GAP_PX;

    return {
      id: params.block.id,
      path: params.blockPath,
      type: "group",
      height,
      direction: params.block.direction,
      childGap,
      wrapperHeight: calculateWrapperHeight(height, measuredChildren, childGap),
      children: measuredChildren,
    };
  }

  if (params.block.type === "list") {
    const children = params.block.items.map((item) => {
      const itemPath = [...params.blockPath, item.id];
      const itemElement = findElementByData(
        params.root,
        "data-resume-list-item-path",
        serializeBlockPath(itemPath),
      );
      const itemHeight = measureElementHeight(
        itemElement,
        params.zoom,
        params.committedSpacerHeights,
      );

      if (!itemElement || itemHeight <= 0) {
        return undefined;
      }

      const itemChildren = item.children.map((child) =>
        measureResumeBlock({
          ...params,
          block: child,
          blockPath: [...itemPath, child.id],
        }),
      );

      const measuredChildren = itemChildren.filter(
        (child): child is MeasuredResumeNode => Boolean(child),
      );
      const measuredEveryChild = measuredChildren.length === item.children.length;

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
              measuredChildren,
              DEFAULT_BLOCK_GAP_PX,
            )
          : itemHeight,
        children: measuredEveryChild ? measuredChildren : undefined,
      };
    });

    if (children.some((child) => !child)) {
      return undefined;
    }

    const measuredChildren = children as MeasuredResumeNode[];
    const childGap = params.block.gap ?? 8;

    return {
      id: params.block.id,
      path: params.blockPath,
      type: "list",
      height,
      direction: "vertical",
      childGap,
      wrapperHeight: calculateWrapperHeight(height, measuredChildren, childGap),
      children: measuredChildren,
    };
  }

  return {
    id: params.block.id,
    path: params.blockPath,
    type: params.block.type,
    height,
    ...(params.block.type === "text"
      ? getTextMeasurements({
          element,
          height,
          zoom: params.zoom,
          sectionId: params.sectionId,
          blockPath: params.blockPath,
          activeEditor: params.activeEditor,
          activeSelection: params.activeSelection,
        })
      : {}),
    ...(params.block.type === "group" || params.block.type === "row"
      ? { direction: "horizontal" as const }
      : {}),
  };
}

export function measureResumeSectionFlow(
  root: HTMLElement,
  section: ResumeDocument["sections"][number],
  params: Omit<MeasureResumeFlowParams, "root" | "document">,
): MeasuredResumeSection | undefined {
  const sectionElement = findElementByData(
    root,
    "data-resume-section-id",
    section.id,
  );
  const titleElement = section.title
    ? (sectionElement?.querySelector<HTMLElement>(
        '[data-resume-section-title="true"]',
      ) ?? undefined)
    : undefined;
  const titleHeight = section.title
    ? measureElementHeight(
        titleElement,
        params.zoom,
        params.committedSpacerHeights,
      )
    : 0;
  const titleGap = titleElement
    ? Math.max(
        0,
        Number.parseFloat(getComputedStyle(titleElement).marginBottom) /
          params.zoom || 0,
      )
    : 0;
  const height = measureElementHeight(
    sectionElement,
    params.zoom,
    params.committedSpacerHeights,
  );
  const blocks = section.blocks.map((block) =>
    measureResumeBlock({
      root,
      block,
      blockPath: [block.id],
      sectionId: section.id,
      zoom: params.zoom,
      activeEditor: params.activeEditor,
      activeSelection: params.activeSelection,
      committedSpacerHeights: params.committedSpacerHeights,
    }),
  );

  if (
    !sectionElement ||
    height <= 0 ||
    blocks.some((block) => !block) ||
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
    blocks: blocks as MeasuredResumeNode[],
  };
}

export function measureResumeFlow({
  root,
  document,
  ...params
}: MeasureResumeFlowParams): MeasuredResumeSection[] | undefined {
  const sections = document.sections
    .filter((section) => section.visible)
    .map((section) => measureResumeSectionFlow(root, section, params));

  return sections.some((section) => !section)
    ? undefined
    : (sections as MeasuredResumeSection[]);
}
