import type {
  MeasuredResumeNode,
  MeasuredResumeSection,
  ResumePageFragment,
  ResumePageLayout,
} from "../pagination";
import type { RichTextPosition } from "./rich-text-range";
import { calculateFragmentHeight, pathsEqual } from "../pagination-model";

interface PagePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResumePageBreak {
  id: string;
  kind: "section" | "structural" | "text";
  sectionId: string;
  path: string[];
  textPosition?: RichTextPosition;
  fromPageIndex: number;
  toPageIndex: number;
  spacerHeight: number;
}

export interface ResumePageBreakMap {
  revision: string;
  pageCount: number;
  breaks: ResumePageBreak[];
  columns?: Array<{ sectionId: string; path: string[]; firstHeight: number; leftHeight: number; rightHeight: number; continues?: boolean }>;
}

interface BreakAnchor {
  kind: ResumePageBreak["kind"];
  path: string[];
  textPosition?: RichTextPosition;
}

function findFirstAnchor(fragment: ResumePageFragment): BreakAnchor {
  if (fragment.columnLayout && !fragment.continuation) return { kind: "structural", path: fragment.path };
  if (fragment.textRange) {
    return {
      kind: "text",
      path: fragment.path,
      textPosition: fragment.textRange.from,
    };
  }

  const child = fragment.children?.[0];

  return child
    ? findFirstAnchor(child)
    : { kind: "structural", path: fragment.path };
}

function hasPath(nodes: MeasuredResumeNode[], path: string[]): boolean {
  return nodes.some(
    (node) =>
      node.path.length === path.length &&
      node.path.every((segment, index) => segment === path[index]) ||
      hasPath(node.children ?? [], path),
  );
}

function createBreakId(sectionId: string, anchor: BreakAnchor) {
  const textSuffix = anchor.textPosition
    ? `:${anchor.textPosition.paragraphIndex}:${anchor.textPosition.nodeIndex}:${anchor.textPosition.offset}`
    : "";

  return `${sectionId}:${anchor.kind}:${anchor.path.join("/")}${textSuffix}`;
}

export function createResumePageBreakMap(input: {
  pages: ResumePageLayout[];
  sections: MeasuredResumeSection[];
  pageHeight: number;
  pageGap: number;
  sectionGap: number;
  pagePadding: PagePadding;
  revision: string;
}): ResumePageBreakMap {
  const sectionMap = new Map(
    input.sections.map((section) => [section.id, section]),
  );
  const breaks: ResumePageBreak[] = [];
  const columns: NonNullable<ResumePageBreakMap["columns"]> = [];
  function findNode(nodes: MeasuredResumeNode[], path: string[]): MeasuredResumeNode | undefined {
    for (const node of nodes) {
      if (pathsEqual(node.path, path)) return node;
      const child = findNode(node.children ?? [], path);
      if (child) return child;
    }
  }
  function collectColumns(sectionId: string, fragments: ResumePageFragment[]) {
    const nodes = sectionMap.get(sectionId)?.blocks ?? [];
    for (const fragment of fragments) {
      if (fragment.columnLayout && !fragment.continuation) {
        const node = findNode(nodes, fragment.path);
        const left = node?.children?.[0];
        const leftFragment = fragment.children?.[0];
        if (node && left && leftFragment) columns.push({ sectionId, path: fragment.path, firstHeight: calculateFragmentHeight(node, fragment), leftHeight: calculateFragmentHeight(left, leftFragment), rightHeight: node.children?.[1]?.height ?? 0, continues: fragment.continues });
      }
      collectColumns(sectionId, fragment.children ?? []);
    }
  }
  function columnSpacerCompensation(sectionId: string, fragments: ResumePageFragment[], anchor: BreakAnchor): number {
    for (const fragment of fragments) {
      if (fragment.columnLayout && anchor.path.length > fragment.path.length && fragment.path.every((id, index) => anchor.path[index] === id)) {
        const node = findNode(sectionMap.get(sectionId)?.blocks ?? [], fragment.path);
        const left = node?.children?.[0];
        const leftFragment = fragment.children?.[0];
        if (node && left && leftFragment) return Math.max(0, calculateFragmentHeight(node, fragment) - calculateFragmentHeight(left, leftFragment));
      }
      const compensation = columnSpacerCompensation(sectionId, fragment.children ?? [], anchor);
      if (compensation) return compensation;
    }
    return 0;
  }
  for (const page of input.pages) for (const section of page.sections) collectColumns(section.sectionId, section.blocks);

  for (let pageIndex = 1; pageIndex < input.pages.length; pageIndex += 1) {
    const previousPage = input.pages[pageIndex - 1]!;
    const page = input.pages[pageIndex]!;
    const firstSection = page.sections.find((section) => section.blocks.length > 0);
    const firstFragment = firstSection?.blocks[0];
    const measuredSection = firstSection
      ? sectionMap.get(firstSection.sectionId)
      : undefined;

    if (!firstSection || !firstFragment || !measuredSection) {
      continue;
    }

    const startsNewSection = !previousPage.sectionIds.includes(
      firstSection.sectionId,
    );
    const anchor: BreakAnchor = startsNewSection
      ? { kind: "section", path: [] }
      : findFirstAnchor(firstFragment);

    if (
      anchor.kind !== "section" &&
      !hasPath(measuredSection.blocks, anchor.path)
    ) {
      continue;
    }

    breaks.push({
      id: createBreakId(firstSection.sectionId, anchor),
      kind: anchor.kind,
      sectionId: firstSection.sectionId,
      path: [...anchor.path],
      ...(anchor.textPosition
        ? { textPosition: { ...anchor.textPosition } }
        : {}),
      fromPageIndex: pageIndex - 1,
      toPageIndex: pageIndex,
      spacerHeight:
        columnSpacerCompensation(firstSection.sectionId, previousPage.sections.find((section) => section.sectionId === firstSection.sectionId)?.blocks ?? [], anchor) +
        Math.max(0, input.pageHeight - previousPage.totalHeight) +
        input.pagePadding.bottom +
        input.pageGap +
        input.pagePadding.top -
        (startsNewSection ? input.sectionGap : 0),
    });
  }

  return {
    revision: input.revision,
    pageCount: input.pages.length,
    breaks,
    ...(columns.length ? { columns } : {}),
  };
}
