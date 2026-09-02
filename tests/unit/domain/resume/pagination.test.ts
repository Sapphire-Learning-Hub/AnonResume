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

  it("treats a zero-height nested container atomically instead of looping", () => {
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
    expect(result.pages[0]?.sections[0]?.blocks).toEqual([
      { path: ["outer-group"] },
    ]);
  });
});
