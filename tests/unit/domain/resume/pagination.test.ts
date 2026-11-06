import {
  type MeasuredResumeNode,
  paginateMeasuredSections,
} from "@/domain/resume/pagination";

function measuredListItem(path: string[], height: number): MeasuredResumeNode {
  return {
    id: path.at(-1)!,
    path,
    type: "listItem",
    direction: "vertical",
    height,
    wrapperHeight: height,
    children: [],
  };
}

describe("paginateMeasuredSections", () => {
  it("uses the measured section-title gap instead of a fixed estimate", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-profile",
          height: 100,
          titleHeight: 20,
          titleGap: 12,
          blocks: [
            {
              id: "profile-content",
              path: ["profile-content"],
              type: "text",
              height: 68,
            },
          ],
        },
      ],
    });

    expect(result.pages[0]?.sections[0]?.totalHeight).toBe(100);
  });

  it("moves a complete section onto the next page when it still fits intact", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 20,
      sections: [
        {
          id: "section-profile",
          height: 40,
          titleHeight: 0,
          keepTogether: true,
          blocks: [
            {
              id: "block-profile",
              path: ["block-profile"],
              type: "text",
              height: 40,
            },
          ],
        },
        {
          id: "section-experience",
          height: 40,
          titleHeight: 0,
          keepTogether: true,
          blocks: [
            {
              id: "block-experience",
              path: ["block-experience"],
              type: "text",
              height: 40,
            },
          ],
        },
        {
          id: "section-projects",
          height: 30,
          titleHeight: 0,
          keepTogether: true,
          blocks: [
            {
              id: "block-projects",
              path: ["block-projects"],
              type: "text",
              height: 30,
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-profile", "section-experience"],
        sections: [
          {
            sectionId: "section-profile",
            includeTitle: false,
            blocks: [{ path: ["block-profile"] }],
            totalHeight: 40,
          },
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [{ path: ["block-experience"] }],
            totalHeight: 40,
          },
        ],
        totalHeight: 100,
      },
      {
        index: 1,
        sectionIds: ["section-projects"],
        sections: [
          {
            sectionId: "section-projects",
            includeTitle: false,
            blocks: [{ path: ["block-projects"] }],
            totalHeight: 30,
          },
        ],
        totalHeight: 30,
      },
    ]);
  });

  it("keeps a section title with the first block when an oversized section must split", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 20,
      sections: [
        {
          id: "section-experience",
          height: 130,
          titleHeight: 20,
          keepTogether: true,
          blocks: [
            {
              id: "block-summary",
              path: ["block-summary"],
              type: "text",
              height: 20,
            },
            {
              id: "block-details",
              path: ["block-details"],
              type: "text",
              height: 70,
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: true,
            blocks: [{ path: ["block-summary"] }],
            totalHeight: 60,
          },
        ],
        totalHeight: 60,
      },
      {
        index: 1,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [{ path: ["block-details"] }],
            totalHeight: 70,
          },
        ],
        totalHeight: 70,
      },
    ]);
  });

  it("splits an oversized group by list items before allowing the page to overflow", () => {
    const result = paginateMeasuredSections({
      pageHeight: 120,
      sectionGap: 20,
      sections: [
        {
          id: "section-experience",
          height: 152,
          titleHeight: 16,
          keepTogether: true,
          blocks: [
            {
              id: "group-experience",
              path: ["group-experience"],
              type: "group",
              height: 116,
              direction: "vertical",
              childGap: 10,
              wrapperHeight: 0,
              children: [
                {
                  id: "row-header",
                  path: ["group-experience", "row-header"],
                  type: "row",
                  height: 16,
                },
                {
                  id: "text-context",
                  path: ["group-experience", "text-context"],
                  type: "text",
                  height: 16,
                },
                {
                  id: "list-highlights",
                  path: ["group-experience", "list-highlights"],
                  type: "list",
                  height: 64,
                  direction: "vertical",
                  childGap: 4,
                  wrapperHeight: 4,
                  children: [
                    measuredListItem(
                      ["group-experience", "list-highlights", "item-1"],
                      12,
                    ),
                    measuredListItem(
                      ["group-experience", "list-highlights", "item-2"],
                      12,
                    ),
                    measuredListItem(
                      ["group-experience", "list-highlights", "item-3"],
                      12,
                    ),
                    measuredListItem(
                      ["group-experience", "list-highlights", "item-4"],
                      12,
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: true,
            blocks: [
              {
                path: ["group-experience"],
                children: [
                  { path: ["group-experience", "row-header"] },
                  { path: ["group-experience", "text-context"] },
                  {
                    path: ["group-experience", "list-highlights"],
                    children: [
                      {
                        path: [
                          "group-experience",
                          "list-highlights",
                          "item-1",
                        ],
                      },
                      {
                        path: [
                          "group-experience",
                          "list-highlights",
                          "item-2",
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            totalHeight: 120,
          },
        ],
        totalHeight: 120,
      },
      {
        index: 1,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [
              {
                path: ["group-experience"],
                children: [
                  {
                    path: ["group-experience", "list-highlights"],
                    continuation: true,
                    children: [
                      {
                        path: [
                          "group-experience",
                          "list-highlights",
                          "item-3",
                        ],
                      },
                      {
                        path: [
                          "group-experience",
                          "list-highlights",
                          "item-4",
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            totalHeight: 32,
          },
        ],
        totalHeight: 32,
      },
    ]);
  });

  it("uses the remaining page space by splitting a list after earlier blocks", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 112,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "text-previous-role",
              path: ["text-previous-role"],
              type: "text",
              height: 40,
            },
            {
              id: "row-next-role",
              path: ["row-next-role"],
              type: "row",
              height: 10,
            },
            {
              id: "list-next-role",
              path: ["list-next-role"],
              type: "list",
              height: 42,
              direction: "vertical",
              childGap: 4,
              wrapperHeight: 4,
              children: [
                measuredListItem(["list-next-role", "item-1"], 10),
                measuredListItem(["list-next-role", "item-2"], 10),
                measuredListItem(["list-next-role", "item-3"], 10),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [
              { path: ["text-previous-role"] },
              { path: ["row-next-role"] },
              {
                path: ["list-next-role"],
                children: [
                  { path: ["list-next-role", "item-1"] },
                  { path: ["list-next-role", "item-2"] },
                ],
              },
            ],
            totalHeight: 98,
          },
        ],
        totalHeight: 98,
      },
      {
        index: 1,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [
              {
                path: ["list-next-role"],
                continuation: true,
                children: [{ path: ["list-next-role", "item-3"] }],
              },
            ],
            totalHeight: 14,
          },
        ],
        totalHeight: 14,
      },
    ]);
  });

  it("does not charge a list trailing wrapper before a split item finishes", () => {
    const result = paginateMeasuredSections({
      pageHeight: 28,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 66,
          titleHeight: 0,
          blocks: [
            {
              id: "list-highlights",
              path: ["list-highlights"],
              type: "list",
              height: 66,
              direction: "vertical",
              childGap: 8,
              wrapperHeight: 8,
              children: [
                {
                  id: "item-1",
                  path: ["list-highlights", "item-1"],
                  type: "listItem",
                  direction: "vertical",
                  height: 40,
                  childGap: 0,
                  wrapperHeight: 0,
                  children: [
                    {
                      id: "item-1-text",
                      path: ["list-highlights", "item-1", "item-1-text"],
                      type: "text",
                      height: 40,
                      textLines: [textLine(0, 1, 20), textLine(1, 2, 20)],
                    },
                  ],
                },
                measuredListItem(["list-highlights", "item-2"], 10),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages.map((page) => page.totalHeight)).toEqual([20, 28, 18]);
    expect(
      result.pages.reduce((total, page) => total + page.totalHeight, 0),
    ).toBe(66);
  });

  it("keeps the list item gap on the page before a structural split", () => {
    const result = paginateMeasuredSections({
      pageHeight: 48,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 96,
          titleHeight: 0,
          blocks: [
            {
              id: "list-highlights",
              path: ["list-highlights"],
              type: "list",
              height: 96,
              direction: "vertical",
              childGap: 8,
              wrapperHeight: 8,
              children: [
                measuredListItem(["list-highlights", "item-1"], 40),
                measuredListItem(["list-highlights", "item-2"], 40),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages.map((page) => page.totalHeight)).toEqual([48, 48]);
    expect(
      result.pages.reduce((total, page) => total + page.totalHeight, 0),
    ).toBe(96);
  });

  it("moves a trailing row with its list when no complete item fits", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 132,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "text-previous-role",
              path: ["text-previous-role"],
              type: "text",
              height: 70,
            },
            {
              id: "row-next-role",
              path: ["row-next-role"],
              type: "row",
              height: 10,
            },
            {
              id: "list-next-role",
              path: ["list-next-role"],
              type: "list",
              height: 42,
              direction: "vertical",
              childGap: 4,
              wrapperHeight: 4,
              children: [
                measuredListItem(["list-next-role", "item-1"], 10),
                measuredListItem(["list-next-role", "item-2"], 10),
                measuredListItem(["list-next-role", "item-3"], 10),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [{ path: ["text-previous-role"] }],
            totalHeight: 70,
          },
        ],
        totalHeight: 70,
      },
      {
        index: 1,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [
              { path: ["row-next-role"] },
              { path: ["list-next-role"] },
            ],
            totalHeight: 62,
          },
        ],
        totalHeight: 62,
      },
    ]);
  });

  it("uses the remaining page space inside a vertical group", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 108,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "text-previous-role",
              path: ["text-previous-role"],
              type: "text",
              height: 40,
            },
            {
              id: "group-next-role",
              path: ["group-next-role"],
              type: "group",
              direction: "vertical",
              height: 58,
              childGap: 6,
              wrapperHeight: 0,
              children: [
                {
                  id: "row-next-role",
                  path: ["group-next-role", "row-next-role"],
                  type: "row",
                  height: 10,
                },
                {
                  id: "list-next-role",
                  path: ["group-next-role", "list-next-role"],
                  type: "list",
                  height: 42,
                  direction: "vertical",
                  childGap: 4,
                  wrapperHeight: 4,
                  children: [
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-1"],
                      10,
                    ),
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-2"],
                      10,
                    ),
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-3"],
                      10,
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages[0]?.sections[0]).toEqual({
      sectionId: "section-experience",
      includeTitle: false,
      blocks: [
        { path: ["text-previous-role"] },
        {
          path: ["group-next-role"],
          children: [
            { path: ["group-next-role", "row-next-role"] },
            {
              path: ["group-next-role", "list-next-role"],
              children: [
                {
                  path: [
                    "group-next-role",
                    "list-next-role",
                    "item-1",
                  ],
                },
                {
                  path: [
                    "group-next-role",
                    "list-next-role",
                    "item-2",
                  ],
                },
              ],
            },
          ],
        },
      ],
      totalHeight: 94,
    });
    expect(result.pages[1]?.sections[0]).toEqual({
      sectionId: "section-experience",
      includeTitle: false,
      blocks: [
        {
          path: ["group-next-role"],
          children: [
            {
              path: ["group-next-role", "list-next-role"],
              continuation: true,
              children: [
                {
                  path: [
                    "group-next-role",
                    "list-next-role",
                    "item-3",
                  ],
                },
              ],
            },
          ],
        },
      ],
      totalHeight: 14,
    });
  });

  it("keeps a nested row with its list when no complete item fits", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-experience",
          height: 138,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "text-previous-role",
              path: ["text-previous-role"],
              type: "text",
              height: 70,
            },
            {
              id: "group-next-role",
              path: ["group-next-role"],
              type: "group",
              direction: "vertical",
              height: 58,
              childGap: 6,
              wrapperHeight: 0,
              children: [
                {
                  id: "row-next-role",
                  path: ["group-next-role", "row-next-role"],
                  type: "row",
                  height: 10,
                },
                {
                  id: "list-next-role",
                  path: ["group-next-role", "list-next-role"],
                  type: "list",
                  height: 42,
                  direction: "vertical",
                  childGap: 4,
                  wrapperHeight: 4,
                  children: [
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-1"],
                      10,
                    ),
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-2"],
                      10,
                    ),
                    measuredListItem(
                      ["group-next-role", "list-next-role", "item-3"],
                      10,
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toEqual([
      {
        index: 0,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [{ path: ["text-previous-role"] }],
            totalHeight: 70,
          },
        ],
        totalHeight: 70,
      },
      {
        index: 1,
        sectionIds: ["section-experience"],
        sections: [
          {
            sectionId: "section-experience",
            includeTitle: false,
            blocks: [{ path: ["group-next-role"] }],
            totalHeight: 58,
          },
        ],
        totalHeight: 58,
      },
    ]);
  });

  it("splits descendants of one list item into the remaining page space", () => {
    const nestedItems = Array.from({ length: 6 }, (_, index) => ({
      id: `nested-${index + 1}`,
      path: ["work-list", "work-item", "nested-list", `nested-${index + 1}`],
      type: "listItem" as const,
      direction: "vertical" as const,
      height: 20,
      wrapperHeight: 20,
      children: [],
    }));
    const result = paginateMeasuredSections({
      pageHeight: 160,
      sectionGap: 0,
      sections: [
        {
          id: "projects",
          height: 248,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "project-summary",
              path: ["project-summary"],
              type: "text",
              height: 70,
            },
            {
              id: "work-list",
              path: ["work-list"],
              type: "list",
              direction: "vertical" as const,
              height: 168,
              childGap: 0,
              wrapperHeight: 0,
              children: [
                {
                  id: "work-item",
                  path: ["work-list", "work-item"],
                  type: "listItem" as const,
                  direction: "vertical" as const,
                  height: 168,
                  childGap: 10,
                  wrapperHeight: 0,
                  children: [
                    {
                      id: "work-label",
                      path: ["work-list", "work-item", "work-label"],
                      type: "text" as const,
                      height: 18,
                    },
                    {
                      id: "nested-list",
                      path: ["work-list", "work-item", "nested-list"],
                      type: "list" as const,
                      direction: "vertical" as const,
                      height: 140,
                      childGap: 4,
                      wrapperHeight: 0,
                      children: nestedItems,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages[0]?.sections[0]?.blocks[1]).toEqual({
      path: ["work-list"],
      children: [
        {
          path: ["work-list", "work-item"],
          children: [
            { path: ["work-list", "work-item", "work-label"] },
            {
              path: ["work-list", "work-item", "nested-list"],
              children: [
                {
                  path: [
                    "work-list",
                    "work-item",
                    "nested-list",
                    "nested-1",
                  ],
                },
                {
                  path: [
                    "work-list",
                    "work-item",
                    "nested-list",
                    "nested-2",
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.pages[1]?.sections[0]?.blocks[0]).toEqual({
      path: ["work-list"],
      continuation: true,
      children: [
        {
          path: ["work-list", "work-item"],
          continuation: true,
          children: [
            {
              path: ["work-list", "work-item", "nested-list"],
              continuation: true,
              children: nestedItems.slice(2).map((item) => ({
                path: item.path,
              })),
            },
          ],
        },
      ],
    });
  });

  it("moves a list-item lead-in with its nested list when no item fits", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-projects",
          height: 150,
          titleHeight: 0,
          topLevelGap: 10,
          blocks: [
            {
              id: "previous-content",
              path: ["previous-content"],
              type: "text",
              height: 70,
            },
            {
              id: "outer-list",
              path: ["outer-list"],
              type: "list",
              direction: "vertical",
              height: 70,
              wrapperHeight: 0,
              childGap: 0,
              children: [
                {
                  id: "outer-item",
                  path: ["outer-list", "outer-item"],
                  type: "listItem",
                  direction: "vertical",
                  height: 70,
                  wrapperHeight: 0,
                  childGap: 10,
                  children: [
                    {
                      id: "lead-in",
                      path: ["outer-list", "outer-item", "lead-in"],
                      type: "text",
                      height: 10,
                    },
                    {
                      id: "nested-list",
                      path: ["outer-list", "outer-item", "nested-list"],
                      type: "list",
                      direction: "vertical",
                      height: 50,
                      wrapperHeight: 0,
                      childGap: 0,
                      children: [
                        measuredListItem(
                          [
                            "outer-list",
                            "outer-item",
                            "nested-list",
                            "nested-item",
                          ],
                          50,
                        ),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages[0]?.sections[0]?.blocks).toEqual([
      { path: ["previous-content"] },
    ]);
    expect(result.pages[1]?.sections[0]?.blocks).toEqual([
      { path: ["outer-list"] },
    ]);
  });

  it.each([1, 2, 3])("isolates an oversized first leaf through %i nested containers", (depth) => {
    const parentPath = Array.from({ length: depth }, (_,index) => `group-${index}`);
    const children: MeasuredResumeNode[] = [150, 50, 60].map((height, index) => ({
      id: `leaf-${index}`, path: [...parentPath, `leaf-${index}`], type: "image", height,
    }));
    let node: MeasuredResumeNode = { id: parentPath.at(-1)!, path: parentPath, type: "group", direction: "vertical", childGap: 10, children, height: 280 };
    for (let index = depth - 2; index >= 0; index -= 1) node = {
      id: parentPath[index]!, path: parentPath.slice(0, index + 1), type: "group", direction: "vertical", height: 280, children: [node],
    };
    const result = paginateMeasuredSections({ pageHeight: 100, sectionGap: 0, sections: [
      { id: "before", height: 20, titleHeight: 0, blocks: [{ id: "before", path: ["before"], type: "text", height: 20 }] },
      { id: "nested", height: 280, titleHeight: 0, blocks: [node] },
    ] });
    expect(result.pages.map((page) => page.totalHeight)).toEqual([20, 150, 50, 60]);
    const leafPaths = (fragments: typeof result.pages[number]["sections"][number]["blocks"]): string[][] =>
      fragments.flatMap((fragment) => fragment.children ? leafPaths(fragment.children) : [fragment.path]);
    expect(result.pages.flatMap((page) => page.sections.flatMap((section) => leafPaths(section.blocks)))).toEqual([
      ["before"], ...children.map((child) => child.path),
    ]);
  });

  it("continues after an oversized text line instead of overflowing the remaining lines", () => {
    const result = paginateMeasuredSections({ pageHeight: 100, sectionGap: 0, sections: [{
      id: "s", titleHeight: 0, height: 170, blocks: [{ id: "t", path: ["t"], type: "text", height: 170,
        textLines: [150, 20].map((height, index) => ({ height, from: { paragraphIndex: 0, nodeIndex: 0, offset: index }, to: { paragraphIndex: 0, nodeIndex: 0, offset: index + 1 } })),
      }],
    }] });
    expect(result.pages.map((page) => page.totalHeight)).toEqual([150, 20]);
    expect(result.pages.map((page) => page.sections[0]!.blocks[0]!.textRange)).toEqual([
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 }, to: { paragraphIndex: 0, nodeIndex: 0, offset: 1 } },
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 1 }, to: { paragraphIndex: 0, nodeIndex: 0, offset: 2 } },
    ]);
  });

  it("keeps an oversized photo on the first column fragment without swallowing later text", () => {
    const result = paginateMeasuredSections({ pageHeight: 100, sectionGap: 0, sections: [{
      id: "s", titleHeight: 0, height: 200, blocks: [{ id: "row", path: ["row"], type: "row", columnLayout: "image-right", height: 200, children: [
        { id: "text", path: ["row", "text"], type: "text", height: 200,
          textLines: Array.from({length: 10}, (_, index) => ({height: 20, from: {paragraphIndex: index, nodeIndex: 0, offset: 0}, to: {paragraphIndex: index, nodeIndex: 0, offset: 1}})),
        },
        { id: "photo", path: ["row", "photo"], type: "image", height: 140 },
      ] }],
    }] });
    expect(result.pages.map((page) => page.totalHeight)).toEqual([140, 100]);
    expect(result.pages.map((page) => page.sections[0]!.blocks[0]!.children?.map((child) => child.path.at(-1)))).toEqual([["text", "photo"], ["text"]]);
  });

  it("places an oversized atomic node once so pagination always advances", () => {
    const result = paginateMeasuredSections({
      pageHeight: 100,
      sectionGap: 0,
      sections: [
        {
          id: "section-atomic",
          height: 180,
          titleHeight: 0,
          blocks: [
            {
              id: "oversized-text",
              path: ["oversized-text"],
              type: "text",
              height: 180,
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.sections[0]?.blocks).toEqual([
      { path: ["oversized-text"] },
    ]);
  });

  it("does not create a blank page before oversized content following an empty container", () => {
    const result = paginateMeasuredSections({
      pageHeight: 50,
      sectionGap: 0,
      sections: [
        {
          id: "section-empty-container",
          height: 80,
          titleHeight: 0,
          blocks: [
            {
              id: "outer-group",
              path: ["outer-group"],
              type: "group",
              direction: "vertical",
              height: 80,
              wrapperHeight: 0,
              childGap: 10,
              children: [
                {
                  id: "empty-group",
                  path: ["outer-group", "empty-group"],
                  type: "group",
                  direction: "vertical",
                  height: 0,
                  wrapperHeight: 0,
                  children: [],
                },
                {
                  id: "remaining-text",
                  path: ["outer-group", "remaining-text"],
                  type: "text",
                  height: 70,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.totalHeight).toBe(80);
  });

  it("splits a rich text block across two pages at measured line boundaries", () => {
    const result = paginateMeasuredSections({
      pageHeight: 60,
      sectionGap: 0,
      sections: [
        {
          id: "section-summary",
          height: 110,
          titleHeight: 0,
          blocks: [
            {
              id: "summary",
              path: ["summary"],
              type: "text",
              height: 110,
              leadingHeight: 5,
              trailingHeight: 5,
              textLines: [
                textLine(0, 5, 25),
                textLine(5, 10, 25),
                textLine(10, 15, 25),
                textLine(15, 20, 25),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.sections[0]?.blocks).toEqual([
      {
        path: ["summary"],
        textRange: {
          from: textPosition(0),
          to: textPosition(10),
        },
      },
    ]);
    expect(result.pages[0]?.sections[0]?.totalHeight).toBe(55);
    expect(result.pages[1]?.sections[0]?.blocks).toEqual([
      {
        path: ["summary"],
        continuation: true,
        textRange: {
          from: textPosition(10),
          to: textPosition(20),
        },
      },
    ]);
    expect(result.pages[1]?.sections[0]?.totalHeight).toBe(55);
  });

  it("splits one rich text block repeatedly across three pages", () => {
    const result = paginateMeasuredSections({
      pageHeight: 45,
      sectionGap: 0,
      sections: [
        {
          id: "section-summary",
          height: 96,
          titleHeight: 0,
          blocks: [
            {
              id: "summary",
              path: ["summary"],
              type: "text",
              height: 96,
              leadingHeight: 3,
              trailingHeight: 3,
              textLines: [
                textLine(0, 4, 15),
                textLine(4, 8, 15),
                textLine(8, 12, 15),
                textLine(12, 16, 15),
                textLine(16, 20, 15),
                textLine(20, 24, 15),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(3);
    expect(
      result.pages.map(
        (page) => page.sections[0]?.blocks[0]?.textRange,
      ),
    ).toEqual([
      { from: textPosition(0), to: textPosition(8) },
      { from: textPosition(8), to: textPosition(20) },
      { from: textPosition(20), to: textPosition(24) },
    ]);
  });

  it("moves a text block when the remaining page cannot fit its first line", () => {
    const result = paginateMeasuredSections({
      pageHeight: 60,
      sectionGap: 0,
      sections: [
        {
          id: "section-summary",
          height: 85,
          titleHeight: 0,
          blocks: [
            {
              id: "intro",
              path: ["intro"],
              type: "badges",
              height: 45,
            },
            {
              id: "summary",
              path: ["summary"],
              type: "text",
              height: 40,
              textLines: [textLine(0, 5, 20), textLine(5, 10, 20)],
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.sections[0]?.blocks).toEqual([
      { path: ["intro"] },
    ]);
    expect(result.pages[1]?.sections[0]?.blocks).toEqual([
      { path: ["summary"] },
    ]);
  });

  it("keeps an atomic inline line intact when splitting rich text", () => {
    const result = paginateMeasuredSections({
      pageHeight: 30,
      sectionGap: 0,
      sections: [
        {
          id: "section-contact",
          height: 40,
          titleHeight: 0,
          blocks: [
            {
              id: "contact",
              path: ["contact"],
              type: "text",
              height: 40,
              textLines: [
                textLine(0, 1, 20, 0),
                textLine(0, 1, 20, 1),
              ],
            },
          ],
        },
      ],
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.sections[0]?.blocks[0]?.textRange).toEqual({
      from: textPosition(0, 0),
      to: textPosition(1, 0),
    });
    expect(result.pages[1]?.sections[0]?.blocks[0]?.textRange).toEqual({
      from: textPosition(0, 1),
      to: textPosition(1, 1),
    });
  });
});

function textPosition(offset: number, nodeIndex = 0) {
  return { paragraphIndex: 0, nodeIndex, offset };
}

function textLine(
  fromOffset: number,
  toOffset: number,
  height: number,
  nodeIndex = 0,
) {
  return {
    from: textPosition(fromOffset, nodeIndex),
    to: textPosition(toOffset, nodeIndex),
    height,
  };
}
