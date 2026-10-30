import {
  calculateFragmentHeight,
  calculateMeasuredChildrenHeight,
  cloneMeasuredNode,
  createWholeFragment,
  pathsEqual,
  type MeasuredResumeNode,
  type MeasuredRichTextLine,
  type ResumePageFragment,
} from "./pagination-model";
import {
  RESUME_DEFAULT_BLOCK_GAP_PX,
  RESUME_DEFAULT_SECTION_TITLE_GAP_PX,
} from "./presentation/defaults";

export type {
  MeasuredResumeNode,
  MeasuredRichTextLine,
  ResumePageFragment,
} from "./pagination-model";

export interface MeasuredResumeSection {
  id: string;
  height: number;
  titleHeight: number;
  titleGap?: number;
  keepTogether?: boolean;
  topLevelGap?: number;
  parallelColumns?: number;
  paddingTop?: number;
  paddingBottom?: number;
  blocks: MeasuredResumeNode[];
}

export interface ResumePageSectionLayout {
  sectionId: string;
  includeTitle: boolean;
  blocks: ResumePageFragment[];
  totalHeight: number;
}

export interface ResumePageLayout {
  index: number;
  sectionIds: string[];
  sections: ResumePageSectionLayout[];
  totalHeight: number;
}

export interface ResumePaginationResult {
  pages: ResumePageLayout[];
}

interface NodePlacementResult {
  fragment?: ResumePageFragment;
  height: number;
  remainingNode?: MeasuredResumeNode;
}

function createEmptyPage(index: number): ResumePageLayout {
  return {
    index,
    sectionIds: [],
    sections: [],
    totalHeight: 0,
  };
}

function getPage(pages: ResumePageLayout[]) {
  const current = pages.at(-1);

  if (current) {
    return current;
  }

  const firstPage = createEmptyPage(0);

  pages.push(firstPage);
  return firstPage;
}

function getTopLevelGap(section: MeasuredResumeSection) {
  return section.topLevelGap ?? RESUME_DEFAULT_BLOCK_GAP_PX;
}

function getSectionPadding(section: MeasuredResumeSection) {
  return (section.paddingTop ?? 0) + (section.paddingBottom ?? 0);
}

function getSectionTitleGap(section: MeasuredResumeSection) {
  return section.titleGap ?? RESUME_DEFAULT_SECTION_TITLE_GAP_PX;
}

function isBreakableVerticalNode(node: MeasuredResumeNode) {
  return (
    Boolean(node.columnLayout) ||
    (node.type === "text" && Boolean(node.textLines?.length)) ||
    (node.direction !== "horizontal" &&
      (node.type === "group" ||
        node.type === "list" ||
        node.type === "listItem") &&
      Boolean(node.children?.length))
  );
}

function calculateTextLinesHeight(lines: MeasuredRichTextLine[]) {
  return lines.reduce((total, line) => total + line.height, 0);
}

function createTextRemainderNode(
  node: MeasuredResumeNode,
  lines: MeasuredRichTextLine[],
) {
  const sourceTo = node.textRange?.to ?? node.textLines?.at(-1)?.to;

  if (!sourceTo || lines.length === 0) {
    return undefined;
  }

  return {
    ...cloneMeasuredNode(node),
    height: calculateTextLinesHeight(lines) + (node.trailingHeight ?? 0),
    continuation: true,
    leadingHeight: 0,
    textLines: lines,
    textRange: {
      from: lines[0]!.from,
      to: sourceTo,
    },
  } satisfies MeasuredResumeNode;
}

function takeTextLines(
  node: MeasuredResumeNode,
  availableSpace: number,
): NodePlacementResult {
  const lines = node.textLines ?? [];
  const leadingHeight = node.leadingHeight ?? 0;
  const trailingHeight = node.trailingHeight ?? 0;
  let height = leadingHeight;
  let lineCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const isLastLine = index === lines.length - 1;
    const nextHeight =
      height + line.height + (isLastLine ? trailingHeight : 0);

    if (nextHeight > availableSpace) {
      break;
    }

    height = nextHeight;
    lineCount += 1;
  }

  if (lineCount === 0) {
    return { height: 0 };
  }

  const placedLines = lines.slice(0, lineCount);
  const remainingLines = lines.slice(lineCount);
  const sourceFrom = node.textRange?.from ?? placedLines[0]!.from;

  return {
    fragment: {
      path: [...node.path],
      ...(node.continuation ? { continuation: true } : {}),
      textRange: {
        from: sourceFrom,
        to: placedLines.at(-1)!.to,
      },
    },
    height,
    remainingNode: createTextRemainderNode(node, remainingLines),
  };
}

function isKeepWithNextCompanion(
  parent: MeasuredResumeNode | undefined,
  previous: MeasuredResumeNode | undefined,
  next: MeasuredResumeNode,
) {
  if (next.type !== "list") {
    return false;
  }

  return (
    previous?.type === "row" ||
    (parent?.type === "listItem" && previous?.type === "text")
  );
}

function popKeepWithNextCompanion(params: {
  parent?: MeasuredResumeNode;
  next: MeasuredResumeNode;
  previous?: MeasuredResumeNode;
  fragments: ResumePageFragment[];
}) {
  const { parent, next, previous, fragments } = params;
  const previousFragment = fragments.at(-1);

  if (
    !previous ||
    !previousFragment ||
    !pathsEqual(previous.path, previousFragment.path) ||
    !isKeepWithNextCompanion(parent, previous, next)
  ) {
    return undefined;
  }

  fragments.pop();
  return previous;
}

function createRemainderNode(
  node: MeasuredResumeNode,
  children: MeasuredResumeNode[],
) {
  const remainder = {
    ...cloneMeasuredNode(node),
    partial: true,
    continuation:
      node.continuation || node.type === "list" || node.type === "listItem",
    children,
  };

  remainder.height = calculateMeasuredChildrenHeight(remainder, children);
  return remainder;
}

function takeVerticalChildren(
  node: MeasuredResumeNode,
  availableSpace: number,
  pageHeight: number,
  keepWithNext: boolean,
): NodePlacementResult {
  const children = node.children ?? [];
  const fragments: ResumePageFragment[] = [];
  const remainingChildren: MeasuredResumeNode[] = [];
  const childGap = node.childGap ?? 0;
  const wrapperHeight = node.wrapperHeight ?? 0;
  let height = wrapperHeight;
  let splitWithinChild = false;

  if (height > availableSpace) {
    return { height: 0 };
  }

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex]!;
    const gapBeforeChild = fragments.length > 0 ? childGap : 0;
    const childSpace = availableSpace - height - gapBeforeChild;

    if (child.height <= childSpace) {
      fragments.push(createWholeFragment(child));
      height += gapBeforeChild + child.height;
      continue;
    }

    const placement = takeNodeFragment(child, childSpace, pageHeight, true, keepWithNext);

    if (placement.fragment && placement.height > 0) {
      fragments.push(placement.fragment);
      height += gapBeforeChild + placement.height;

      if (placement.remainingNode) {
        splitWithinChild = true;
        remainingChildren.push(
          placement.remainingNode,
          ...children.slice(childIndex + 1),
        );
      } else {
        remainingChildren.push(...children.slice(childIndex + 1));
      }
      break;
    }

    const companion = keepWithNext ? popKeepWithNextCompanion({
      parent: node,
      next: child,
      previous: children[childIndex - 1],
      fragments,
    }) : undefined;

    if (companion) {
      height -= companion.height + (fragments.length > 0 ? childGap : 0);
      remainingChildren.push(
        companion,
        child,
        ...children.slice(childIndex + 1),
      );
      break;
    }

    remainingChildren.push(child, ...children.slice(childIndex + 1));
    break;
  }

  if (fragments.length === 0) {
    return { height: 0 };
  }

  if (splitWithinChild) {
    height -= wrapperHeight;
  }

  return {
    fragment: {
      path: [...node.path],
      children: fragments,
      ...(splitWithinChild && wrapperHeight > 0
        ? { includeWrapper: false }
        : {}),
      ...(node.continuation ? { continuation: true } : {}),
    },
    height,
    remainingNode: remainingChildren.length
      ? createRemainderNode(node, remainingChildren)
      : undefined,
  };
}

function takeColumnFragment(node: MeasuredResumeNode, availableSpace: number, pageHeight: number, keepWithNext: boolean): NodePlacementResult {
  const left = node.children?.[0];
  const image = node.continuation ? undefined : node.children?.[1];
  if (!left || (image && image.height > availableSpace)) return { height: 0 };
  const placed = takeNodeFragment(left, availableSpace, pageHeight, true, keepWithNext);
  if (!placed.fragment) return { height: 0 };
  return {
    fragment: { path: [...node.path], columnLayout: node.columnLayout, ...(placed.remainingNode ? { continues: true } : {}), ...(node.continuation ? { continuation: true } : {}), children: [placed.fragment, ...(image ? [createWholeFragment(image)] : [])] },
    height: Math.max(placed.height, image?.height ?? 0),
    remainingNode: placed.remainingNode ? { ...node, continuation: true, partial: true, children: [placed.remainingNode], height: placed.remainingNode.height } : undefined,
  };
}

function takeNodeFragment(
  node: MeasuredResumeNode,
  availableSpace: number,
  pageHeight: number,
  allowSplit: boolean,
  keepWithNext: boolean,
): NodePlacementResult {
  if (node.height <= availableSpace) {
    return {
      fragment: createWholeFragment(node),
      height: node.height,
    };
  }

  if (!allowSplit || !isBreakableVerticalNode(node)) {
    return { height: 0 };
  }

  if (node.columnLayout) return takeColumnFragment(node, availableSpace, pageHeight, keepWithNext);

  if (node.type === "text" && node.textLines?.length) {
    return takeTextLines(node, availableSpace);
  }

  return takeVerticalChildren(node, availableSpace, pageHeight, keepWithNext);
}

function createSectionFragment(
  section: MeasuredResumeSection,
  measuredBlocks: MeasuredResumeNode[],
  blocks: ResumePageFragment[],
  includeTitle: boolean,
): ResumePageSectionLayout {
  const totalHeight =
    getSectionPadding(section) +
    (includeTitle && section.titleHeight > 0
      ? section.titleHeight +
        (blocks.length > 0 ? getSectionTitleGap(section) : (section.titleGap ?? 0))
      : 0) +
    blocks.reduce((total, fragment, blockIndex) => {
      const block = measuredBlocks.find((candidate) =>
        pathsEqual(candidate.path, fragment.path),
      );

      if (!block) {
        return total;
      }

      return (
        total +
        (blockIndex > 0 ? getTopLevelGap(section) : 0) +
        calculateFragmentHeight(block, fragment)
      );
    }, 0);

  return {
    sectionId: section.id,
    includeTitle,
    blocks,
    totalHeight,
  };
}

function takeSectionFragment(params: {
  section: MeasuredResumeSection;
  blocks: MeasuredResumeNode[];
  availableSpace: number;
  pageHeight: number;
  includeTitle: boolean;
  allowOverflow: boolean;
  keepWithNext?: boolean;
}): { fragment?: ResumePageSectionLayout; remainingBlocks: MeasuredResumeNode[] } {
  const { section, blocks, availableSpace, pageHeight, includeTitle, allowOverflow, keepWithNext = true } = params;
  const placedBlocks: ResumePageFragment[] = [];
  const remainingBlocks: MeasuredResumeNode[] = [];
  let usedHeight = getSectionPadding(section) +
    (includeTitle && section.titleHeight > 0 ? section.titleHeight : 0);
  if (includeTitle && blocks.length === 0) usedHeight += section.titleGap ?? 0;

  if (includeTitle && blocks.length > 0) {
    usedHeight += getSectionTitleGap(section);
  }

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    const gapBeforeBlock =
      placedBlocks.length > 0 ? getTopLevelGap(section) : 0;
    const freeSpace = availableSpace - usedHeight - gapBeforeBlock;
    const placement =
      freeSpace > 0
        ? takeNodeFragment(
            block,
            freeSpace,
            pageHeight,
            placedBlocks.length === 0 || isBreakableVerticalNode(block),
            keepWithNext,
          )
        : { height: 0 };

    if (!placement.fragment || placement.height <= 0) {
      if (placedBlocks.length === 0) {
        if (!allowOverflow) break;
        // A keep-with-next preference must not turn a splittable container into
        // one oversized atomic block. Retry once on an empty page without it.
        if (keepWithNext) return takeSectionFragment({ ...params, keepWithNext: false });
        if (block.columnLayout && includeTitle && section.titleHeight > 0) {
          return { fragment: { sectionId: section.id, includeTitle: true, blocks: [], totalHeight: section.titleHeight + getSectionPadding(section) + (section.titleGap ?? 0) }, remainingBlocks: blocks };
        }
        placedBlocks.push(createWholeFragment(block));
        usedHeight += gapBeforeBlock + block.height;
        remainingBlocks.push(...blocks.slice(blockIndex + 1));
      } else {
        const companion = keepWithNext ? popKeepWithNextCompanion({
          next: block,
          previous: blocks[blockIndex - 1],
          fragments: placedBlocks,
        }) : undefined;

        if (companion) {
          usedHeight -=
            companion.height +
            (placedBlocks.length > 0 ? getTopLevelGap(section) : 0);
          remainingBlocks.push(
            companion,
            block,
            ...blocks.slice(blockIndex + 1),
          );
        } else {
          remainingBlocks.push(...blocks.slice(blockIndex));
        }
      }
      break;
    }

    placedBlocks.push(placement.fragment);
    usedHeight += gapBeforeBlock + placement.height;

    if (placement.remainingNode) {
      remainingBlocks.push(
        placement.remainingNode,
        ...blocks.slice(blockIndex + 1),
      );
      break;
    }
  }

  if (placedBlocks.length === 0 && blocks.length > 0 && allowOverflow && keepWithNext) {
    return takeSectionFragment({ ...params, keepWithNext: false });
  }

  if (
    placedBlocks.length === 0 &&
    includeTitle &&
    section.titleHeight > 0 &&
    blocks.length === 0 &&
    (usedHeight <= availableSpace || allowOverflow)
  ) {
    return {
      fragment: {
        sectionId: section.id,
        includeTitle: true,
        blocks: [],
        totalHeight: usedHeight,
      } satisfies ResumePageSectionLayout,
      remainingBlocks: [],
    };
  }

  return {
    fragment:
      placedBlocks.length > 0
        ? createSectionFragment(section, blocks, placedBlocks, includeTitle)
        : undefined,
    remainingBlocks:
      remainingBlocks.length > 0
        ? remainingBlocks
        : blocks.slice(placedBlocks.length),
  };
}

function appendSectionToPage(
  page: ResumePageLayout,
  section: ResumePageSectionLayout,
  sectionGap: number,
) {
  page.sections.push(section);
  page.sectionIds.push(section.sectionId);
  page.totalHeight +=
    section.totalHeight + (page.sections.length > 1 ? sectionGap : 0);
}

export function paginateMeasuredSections(input: {
  pageHeight: number;
  sectionGap: number;
  sections: MeasuredResumeSection[];
}): ResumePaginationResult {
  if (input.sections.length === 0) {
    return { pages: [createEmptyPage(0)] };
  }

  const pages: ResumePageLayout[] = [createEmptyPage(0)];

  for (const section of input.sections) {
    // Empty sections still occupy their insets and the surrounding section gaps.
    // Keep them in both layouts so the continuous canvas and printed pages agree.
    if (section.blocks.length === 0 && section.titleHeight === 0) {
      let page = getPage(pages);
      const height = getSectionPadding(section);
      if (page.sections.length > 0 && page.totalHeight + input.sectionGap + height > input.pageHeight) {
        pages.push(createEmptyPage(pages.length));
        page = getPage(pages);
      }
      appendSectionToPage(page, { sectionId: section.id, includeTitle: false, blocks: [], totalHeight: height }, input.sectionGap);
      continue;
    }
    if (section.parallelColumns && section.blocks.length) {
      const currentPage = getPage(pages);
      if (
        section.keepTogether &&
        section.height <= input.pageHeight &&
        currentPage.sections.length > 0 &&
        currentPage.totalHeight + input.sectionGap + section.height >
          input.pageHeight
      ) {
        pages.push(createEmptyPage(pages.length));
      }
      let includeTitle = section.titleHeight > 0;
      for (
        let offset = 0;
        offset < section.blocks.length;
        offset += section.parallelColumns
      ) {
        const row = section.blocks.slice(
          offset,
          offset + section.parallelColumns,
        );
        const rowHeight = Math.max(...row.map((block) => block.height));
        const titleHeight = includeTitle
          ? section.titleHeight + getSectionTitleGap(section)
          : 0;
        let page = getPage(pages);
        let currentSection = page.sections.at(-1);
        let gap =
          currentSection?.sectionId === section.id
            ? getTopLevelGap(section)
            : page.sections.length
              ? input.sectionGap
              : 0;
        if (
          page.sections.length &&
          page.totalHeight + gap + titleHeight + rowHeight +
            (currentSection?.sectionId === section.id ? 0 : getSectionPadding(section)) > input.pageHeight
        ) {
          pages.push(createEmptyPage(pages.length));
          page = getPage(pages);
          currentSection = undefined;
          gap = 0;
        }
        const height = titleHeight + rowHeight +
          (currentSection?.sectionId === section.id ? 0 : getSectionPadding(section));
        if (currentSection?.sectionId === section.id) {
          currentSection.blocks.push(...row.map(createWholeFragment));
          currentSection.totalHeight += gap + height;
          page.totalHeight += gap + height;
        } else {
          appendSectionToPage(
            page,
            {
              sectionId: section.id,
              includeTitle,
              blocks: row.map(createWholeFragment),
              totalHeight: height,
            },
            input.sectionGap,
          );
        }
        includeTitle = false;
      }
      continue;
    }
    let remainingBlocks = section.blocks.map(cloneMeasuredNode);
    let includeTitle = section.titleHeight > 0;

    while (
      remainingBlocks.length > 0 ||
      (includeTitle && section.titleHeight > 0)
    ) {
      let currentPage = getPage(pages);
      const pageSpace =
        input.pageHeight -
        currentPage.totalHeight -
        (currentPage.sections.length > 0 ? input.sectionGap : 0);

      if (
        section.keepTogether &&
        section.height <= input.pageHeight &&
        currentPage.sections.length > 0 &&
        pageSpace < section.height
      ) {
        pages.push(createEmptyPage(pages.length));
        currentPage = getPage(pages);
      }

      const result = takeSectionFragment({
        section,
        blocks: remainingBlocks,
        availableSpace:
          input.pageHeight -
          currentPage.totalHeight -
          (currentPage.sections.length > 0 ? input.sectionGap : 0),
        pageHeight: input.pageHeight,
        includeTitle,
        allowOverflow: currentPage.sections.length === 0,
      });

      if (!result.fragment) {
        if (currentPage.sections.length === 0) {
          appendSectionToPage(
            currentPage,
            {
              sectionId: section.id,
              includeTitle,
              blocks: remainingBlocks.map(createWholeFragment),
              totalHeight: section.height,
            },
            input.sectionGap,
          );
          remainingBlocks = [];
          includeTitle = false;
          continue;
        }

        pages.push(createEmptyPage(pages.length));
        continue;
      }

      appendSectionToPage(currentPage, result.fragment, input.sectionGap);
      remainingBlocks = result.remainingBlocks;
      includeTitle = false;

      if (remainingBlocks.length > 0) {
        pages.push(createEmptyPage(pages.length));
      }
    }
  }

  return { pages };
}
