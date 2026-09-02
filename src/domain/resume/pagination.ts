import {
  calculateFragmentHeight,
  calculateMeasuredChildrenHeight,
  cloneMeasuredNode,
  createWholeFragment,
  pathsEqual,
  type MeasuredResumeNode,
  type ResumePageFragment,
} from "./pagination-model";

const DEFAULT_SECTION_TITLE_GAP_PX = 20;
const DEFAULT_TOP_LEVEL_BLOCK_GAP_PX = 10;

export type { MeasuredResumeNode, ResumePageFragment } from "./pagination-model";

export interface MeasuredResumeSection {
  id: string;
  height: number;
  titleHeight: number;
  titleGap?: number;
  keepTogether?: boolean;
  topLevelGap?: number;
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
  return section.topLevelGap ?? DEFAULT_TOP_LEVEL_BLOCK_GAP_PX;
}

function getSectionTitleGap(section: MeasuredResumeSection) {
  return section.titleGap ?? DEFAULT_SECTION_TITLE_GAP_PX;
}

function isBreakableVerticalNode(node: MeasuredResumeNode) {
  return (
    node.direction !== "horizontal" &&
    (node.type === "group" ||
      node.type === "list" ||
      node.type === "listItem") &&
    Boolean(node.children?.length)
  );
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
): NodePlacementResult {
  const children = node.children ?? [];
  const fragments: ResumePageFragment[] = [];
  const remainingChildren: MeasuredResumeNode[] = [];
  const childGap = node.childGap ?? 0;
  let height = node.wrapperHeight ?? 0;

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

    const placement = takeNodeFragment(child, childSpace, pageHeight, true);

    if (placement.fragment && placement.height > 0) {
      fragments.push(placement.fragment);
      height += gapBeforeChild + placement.height;

      if (placement.remainingNode) {
        remainingChildren.push(
          placement.remainingNode,
          ...children.slice(childIndex + 1),
        );
      } else {
        remainingChildren.push(...children.slice(childIndex + 1));
      }
      break;
    }

    const companion = popKeepWithNextCompanion({
      parent: node,
      next: child,
      previous: children[childIndex - 1],
      fragments,
    });

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

  return {
    fragment: {
      path: [...node.path],
      children: fragments,
      ...(node.continuation ? { continuation: true } : {}),
    },
    height,
    remainingNode: remainingChildren.length
      ? createRemainderNode(node, remainingChildren)
      : undefined,
  };
}

function takeNodeFragment(
  node: MeasuredResumeNode,
  availableSpace: number,
  pageHeight: number,
  allowSplit: boolean,
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

  return takeVerticalChildren(node, availableSpace, pageHeight);
}

function createSectionFragment(
  section: MeasuredResumeSection,
  measuredBlocks: MeasuredResumeNode[],
  blocks: ResumePageFragment[],
  includeTitle: boolean,
): ResumePageSectionLayout {
  const totalHeight =
    (includeTitle && section.titleHeight > 0
      ? section.titleHeight +
        (blocks.length > 0 ? getSectionTitleGap(section) : 0)
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
}) {
  const { section, blocks, availableSpace, pageHeight, includeTitle } = params;
  const placedBlocks: ResumePageFragment[] = [];
  const remainingBlocks: MeasuredResumeNode[] = [];
  let usedHeight =
    includeTitle && section.titleHeight > 0 ? section.titleHeight : 0;

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
          )
        : { height: 0 };

    if (!placement.fragment || placement.height <= 0) {
      if (placedBlocks.length === 0) {
        placedBlocks.push(createWholeFragment(block));
        usedHeight += gapBeforeBlock + block.height;
        remainingBlocks.push(...blocks.slice(blockIndex + 1));
      } else {
        const companion = popKeepWithNextCompanion({
          next: block,
          previous: blocks[blockIndex - 1],
          fragments: placedBlocks,
        });

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

  if (
    placedBlocks.length === 0 &&
    includeTitle &&
    section.titleHeight > 0 &&
    blocks.length === 0
  ) {
    return {
      fragment: {
        sectionId: section.id,
        includeTitle: true,
        blocks: [],
        totalHeight: section.titleHeight,
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
