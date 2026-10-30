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
  it.each(["section", "group", "listItem"] as const)(
    "relaxes an impossible keep-with-next constraint inside %s without overflowing or losing content",
    (container) => {
      const parentPath =
        container === "section"
          ? []
          : container === "group"
            ? ["group"]
            : ["outer", "outer-item"];
      const lead: MeasuredResumeNode = {
        id: "lead",
        path: [...parentPath, "lead"],
        type: container === "listItem" ? "text" : "row",
        height: 160,
      };
      const list: MeasuredResumeNode = {
        id: "list",
        path: [...parentPath, "list"],
        type: "list",
        direction: "vertical",
        height: 240,
        childGap: 0,
        children: [0, 1, 2].map((index) => ({
          id: `item-${index}`,
          path: [...parentPath, "list", `item-${index}`],
          type: "listItem",
          height: 80,
          wrapperHeight: 80,
        })),
      };
      const children = [lead, list];
      const blocks: MeasuredResumeNode[] =
        container === "section"
          ? children
          : container === "group"
            ? [
                {
                  id: "group",
                  path: ["group"],
                  type: "group",
                  direction: "vertical",
                  childGap: 10,
                  height: 410,
                  children,
                },
              ]
            : [
                {
                  id: "outer",
                  path: ["outer"],
                  type: "list",
                  height: 410,
                  children: [
                    {
                      id: "outer-item",
                      path: parentPath,
                      type: "listItem",
                      height: 410,
                      childGap: 10,
                      children,
                    },
                  ],
                },
              ];
      const pages = paginateMeasuredSections({
        pageHeight: 200,
        sectionGap: 0,
        sections: [{ ...section("nested", blocks), topLevelGap: 10 }],
      }).pages;
      expect(pages.map((page) => page.totalHeight)).toEqual([160, 160, 80]);
      const leaves = (
        fragments: (typeof pages)[number]["sections"][number]["blocks"],
      ): string[] =>
        fragments.flatMap((fragment) =>
          fragment.children?.length
            ? leaves(fragment.children)
            : [fragment.path.at(-1)!],
        );
      expect(
        pages.flatMap((page) =>
          page.sections.flatMap((part) => leaves(part.blocks)),
        ),
      ).toEqual(["lead", "item-0", "item-1", "item-2"]);
    },
  );

  it("preserves a section title and insets when keep-with-next leaves no room for its first nested fragment", () => {
    const group: MeasuredResumeNode = {
      id: "group",
      path: ["group"],
      type: "group",
      height: 320,
      childGap: 10,
      children: [
        { id: "lead", path: ["group", "lead"], type: "row", height: 140 },
        {
          id: "list",
          path: ["group", "list"],
          type: "list",
          height: 170,
          childGap: 10,
          children: [0, 1].map((i) => ({
            id: `item-${i}`,
            path: ["group", "list", `item-${i}`],
            type: "listItem",
            height: 80,
            wrapperHeight: 80,
          })),
        },
      ],
    };
    const pages = paginateMeasuredSections({
      pageHeight: 200,
      sectionGap: 0,
      sections: [
        {
          ...section("nested", [group]),
          titleHeight: 30,
          titleGap: 10,
          paddingTop: 10,
          paddingBottom: 10,
        },
      ],
    }).pages;
    expect(pages.map((page) => page.totalHeight)).toEqual([200, 190]);
    expect(pages[0]?.sections[0]?.includeTitle).toBe(true);
    expect(pages[1]?.sections[0]?.includeTitle).toBe(false);
  });

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
