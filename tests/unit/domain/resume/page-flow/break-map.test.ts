import { describe, expect, it } from "vitest";

import { createResumePageBreakMap } from "@/domain/resume/page-flow/break-map";
import type {
  MeasuredResumeSection,
  ResumePageLayout,
} from "@/domain/resume/pagination";

const structuralSections: MeasuredResumeSection[] = [
  {
    id: "section-main",
    height: 110,
    titleHeight: 0,
    blocks: [
      { id: "first", path: ["first"], type: "text", height: 70 },
      { id: "second", path: ["second"], type: "text", height: 40 },
    ],
  },
];

describe("createResumePageBreakMap", () => {
  it("creates a stable structural break with exact page transition spacing", () => {
    const pages: ResumePageLayout[] = [
      page(0, 70, [{ path: ["first"] }]),
      page(1, 40, [{ path: ["second"] }]),
    ];
    const first = createResumePageBreakMap({
      pages,
      sections: structuralSections,
      pageHeight: 100,
      pageGap: 24,
      sectionGap: 20,
      pagePadding: { top: 10, right: 12, bottom: 10, left: 12 },
      revision: "document-3",
    });
    const second = createResumePageBreakMap({
      pages,
      sections: structuralSections,
      pageHeight: 100,
      pageGap: 24,
      sectionGap: 20,
      pagePadding: { top: 10, right: 12, bottom: 10, left: 12 },
      revision: "document-3",
    });

    expect(first).toEqual({
      revision: "document-3",
      pageCount: 2,
      breaks: [
        {
          id: second.breaks[0]?.id,
          kind: "structural",
          sectionId: "section-main",
          path: ["second"],
          fromPageIndex: 0,
          toPageIndex: 1,
          spacerHeight: 74,
        },
      ],
    });
    expect(first.breaks[0]?.id).toBe(second.breaks[0]?.id);
  });

  it("moves a whole section to the next page from the section boundary", () => {
    const result = createResumePageBreakMap({
      pages: [
        {
          index: 0,
          sectionIds: ["section-first"],
          totalHeight: 70,
          sections: [
            {
              sectionId: "section-first",
              includeTitle: true,
              blocks: [{ path: ["first"] }],
              totalHeight: 70,
            },
          ],
        },
        {
          index: 1,
          sectionIds: ["section-kept"],
          totalHeight: 60,
          sections: [
            {
              sectionId: "section-kept",
              includeTitle: true,
              blocks: [{ path: ["kept"] }],
              totalHeight: 60,
            },
          ],
        },
      ],
      sections: [
        {
          id: "section-first",
          height: 70,
          titleHeight: 20,
          blocks: [{ id: "first", path: ["first"], type: "text", height: 50 }],
        },
        {
          id: "section-kept",
          height: 60,
          titleHeight: 20,
          keepTogether: true,
          blocks: [{ id: "kept", path: ["kept"], type: "text", height: 40 }],
        },
      ],
      pageHeight: 100,
      pageGap: 24,
      pagePadding: { top: 10, right: 12, bottom: 10, left: 12 },
      revision: "kept-section",
      sectionGap: 20,
    });

    expect(result.breaks).toEqual([
      {
        id: result.breaks[0]?.id,
        kind: "section",
        sectionId: "section-kept",
        path: [],
        fromPageIndex: 0,
        toPageIndex: 1,
        spacerHeight: 54,
      },
    ]);
  });

  it("anchors a text continuation at the next fragment range", () => {
    const pages: ResumePageLayout[] = [
      page(0, 55, [
        {
          path: ["summary"],
          textRange: {
            from: position(0),
            to: position(10),
          },
        },
      ]),
      page(1, 55, [
        {
          path: ["summary"],
          continuation: true,
          textRange: {
            from: position(10),
            to: position(20),
          },
        },
      ]),
    ];
    const result = createResumePageBreakMap({
      pages,
      sections: [
        {
          id: "section-main",
          height: 110,
          titleHeight: 0,
          blocks: [
            {
              id: "summary",
              path: ["summary"],
              type: "text",
              height: 110,
            },
          ],
        },
      ],
      pageHeight: 100,
      pageGap: 20,
      sectionGap: 20,
      pagePadding: { top: 12, right: 12, bottom: 8, left: 12 },
      revision: "document-4",
    });

    expect(result.breaks).toEqual([
      {
        id: result.breaks[0]?.id,
        kind: "text",
        sectionId: "section-main",
        path: ["summary"],
        textPosition: position(10),
        fromPageIndex: 0,
        toPageIndex: 1,
        spacerHeight: 85,
      },
    ]);
  });

  it("clamps unused content space for an oversized page", () => {
    const result = createResumePageBreakMap({
      pages: [
        page(0, 140, [{ path: ["first"] }]),
        page(1, 40, [{ path: ["second"] }]),
      ],
      sections: structuralSections,
      pageHeight: 100,
      pageGap: 20,
      sectionGap: 20,
      pagePadding: { top: 10, right: 10, bottom: 10, left: 10 },
      revision: "oversized",
    });

    expect(result.breaks[0]?.spacerHeight).toBe(40);
  });
});

function page(
  index: number,
  totalHeight: number,
  blocks: ResumePageLayout["sections"][number]["blocks"],
): ResumePageLayout {
  return {
    index,
    sectionIds: ["section-main"],
    totalHeight,
    sections: [
      {
        sectionId: "section-main",
        includeTitle: false,
        blocks,
        totalHeight,
      },
    ],
  };
}

function position(offset: number) {
  return { paragraphIndex: 0, nodeIndex: 0, offset };
}
