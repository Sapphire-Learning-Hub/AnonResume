import { describe, expect, it } from "vitest";

import {
  paginateMeasuredSections,
  type MeasuredResumeNode,
  type MeasuredResumeSection,
} from "@/domain/resume/pagination";
import { createResumePageBreakMap } from "@/domain/resume/page-flow/break-map";

const block = (id: string, height: number): MeasuredResumeNode => ({
  id,
  path: [id],
  type: "image",
  height,
});
const section = (
  id: string,
  blocks: MeasuredResumeNode[],
): MeasuredResumeSection => ({
  id,
  blocks,
  titleHeight: 0,
  topLevelGap: 0,
  height: blocks.reduce((sum, item) => sum + item.height, 0),
});

describe("rendering page boundaries", () => {
  it("keeps empty section spacing consistent between continuous and paged rendering", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 10,
      sections: [
        section("before", [block("a", 60)]),
        section("empty", []),
        section("after", [block("b", 30)]),
      ],
    });
    expect(result.pages.map((page) => page.sectionIds)).toEqual([
      ["before", "empty"],
      ["after"],
    ]);
    expect(result.pages.map((page) => page.totalHeight)).toEqual([70, 30]);
  });
  it.each([undefined, 2])(
    "budgets section padding on every page in vertical and grid layout (%s)",
    (parallelColumns) => {
      const items = parallelColumns
        ? [block("a", 80), block("b", 60), block("c", 80), block("d", 60)]
        : [block("a", 80), block("c", 80)];
      const padded = {
        ...section("padded", items),
        height: 180,
        paddingTop: 10,
        paddingBottom: 10,
        parallelColumns,
      };
      const pages = paginateMeasuredSections({
        pageHeight: 100,
        sectionGap: 10,
        sections: [padded],
      }).pages;
      expect(pages.map((page) => page.totalHeight)).toEqual([100, 100]);
      const map = createResumePageBreakMap({
        pages,
        sections: [padded],
        pageHeight: 100,
        pageGap: 24,
        sectionGap: 10,
        pagePadding: { top: 10, right: 10, bottom: 10, left: 10 },
        revision: "padding",
      });
      // The continuous canvas must repeat the same section inset as discrete print pages.
      expect(map.breaks[0]?.spacerHeight).toBe(64);
    },
  );

  it("moves the first indivisible block of a new section off a partially filled page", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 10,
      sections: [
        section("before", [block("a", 70)]),
        section("after", [block("b", 40)]),
      ],
    });
    expect(result.pages.map((page) => page.sectionIds)).toEqual([
      ["before"],
      ["after"],
    ]);
    expect(result.pages.map((page) => page.totalHeight)).toEqual([70, 40]);
  });

  it("keeps a title with its first indivisible block when both fit a new page", () => {
    const after = {
      ...section("after", [block("b", 40)]),
      titleHeight: 20,
      titleGap: 10,
      height: 70,
    };
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 10,
      sections: [section("before", [block("a", 40)]), after],
    });
    expect(result.pages.map((page) => page.totalHeight)).toEqual([40, 70]);
    expect(result.pages[1]?.sections[0]?.includeTitle).toBe(true);
  });

  it("does not put a title-only section outside the page or lose its canvas page break", () => {
    const sections = [
      section("before", [block("a", 90)]),
      { ...section("title-only", []), titleHeight: 20, height: 20 },
    ];
    const pages = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 10,
      sections,
    }).pages;
    expect(pages.map((page) => page.totalHeight)).toEqual([90, 20]);
    const breaks = createResumePageBreakMap({
      pages,
      sections,
      pageHeight: 100,
      pageGap: 24,
      sectionGap: 10,
      pagePadding: { top: 10, right: 10, bottom: 10, left: 10 },
      revision: "title-only",
    });
    expect(breaks.breaks).toHaveLength(1);
    expect(breaks.breaks[0]).toMatchObject({
      kind: "section",
      sectionId: "title-only",
      spacerHeight: 44,
    });
  });
});
