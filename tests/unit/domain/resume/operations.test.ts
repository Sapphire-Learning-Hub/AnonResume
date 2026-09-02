import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  appendBlockToSectionDocument,
  findBlockByPath,
  findTextBlock,
  getBlockSiblingPosition,
  getPlainTextFromRichText,
  insertBlockAfterDocument,
  moveBlockInDocument,
  removeBlockFromDocument,
  removeListItemFromDocument,
  updateTextBlockContentInDocument,
} from "@/domain/resume/operations";
import type { RichTextContent } from "@/domain/resume/schema";

function richText(text: string): RichTextContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

describe("resume operations", () => {
  it("omits decorative resume icons from extracted plain text", () => {
    expect(
      getPlainTextFromRichText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "resumeIcon",
                attrs: { iconId: "lucide:phone" },
              },
              { type: "text", text: " 13800000000" },
            ],
          },
        ],
      }),
    ).toBe(" 13800000000");
  });

  it("appends a component to the selected section", () => {
    const document = createDefaultResumeDocument();
    const block = {
      id: "badges-custom",
      type: "badges" as const,
      wrap: true,
      items: [{ id: "badge-custom", text: "Custom" }],
    };

    const updated = appendBlockToSectionDocument({
      document,
      sectionId: "section-profile",
      block,
    });

    expect(updated.sections[0]?.blocks.at(-1)).toEqual(block);
    expect(updated.sections[1]).toBe(document.sections[1]);
  });

  it("inserts a component after a selected child in a nested list item", () => {
    const document = createDefaultResumeDocument();
    const block = {
      id: "badges-inside-list-item",
      type: "badges" as const,
      wrap: true,
      items: [{ id: "badge-inside-list-item", text: "Nested" }],
    };
    const sourcePath = [
      "block-profile-highlights",
      "item-foundation-1",
      "item-foundation-1-text",
    ];

    const updated = insertBlockAfterDocument({
      document,
      sectionId: "section-profile",
      blockPath: sourcePath,
      block,
    });

    expect(
      findBlockByPath(updated.sections[0]!.blocks, [
        "block-profile-highlights",
        "item-foundation-1",
        "badges-inside-list-item",
      ]),
    ).toEqual(block);
  });

  it("finds a nested text block inside a list item child path", () => {
    const document = createDefaultResumeDocument();

    const block = findTextBlock(document, "section-profile", [
      "block-profile-highlights",
      "item-foundation-1",
      "item-foundation-1-text",
    ]);

    expect(block?.type).toBe("text");
    expect(block?.content.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "基于流式布局的结构化简历编辑基础能力",
    });
  });

  it("updates nested list item child text blocks by block path", () => {
    const document = createDefaultResumeDocument();

    const updated = updateTextBlockContentInDocument({
      document,
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-text",
      ],
      content: richText("Updated nested list item"),
    });
    const block = findTextBlock(updated, "section-profile", [
      "block-profile-highlights",
      "item-foundation-1",
      "item-foundation-1-text",
    ]);

    expect(block?.content.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "Updated nested list item",
    });
  });

  it("reports sibling position for list item child blocks", () => {
    const document = createDefaultResumeDocument();
    const profileSection = document.sections[0];
    const listBlock = profileSection?.blocks[1];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected the profile highlights block to stay a list.");
    }

    listBlock.items[0] = {
      ...listBlock.items[0],
      children: [
        listBlock.items[0]!.children[0]!,
        {
          id: "item-foundation-1-detail",
          type: "text",
          content: richText("Extra detail"),
        },
      ],
    };

    expect(
      getBlockSiblingPosition(document, "section-profile", [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-detail",
      ]),
    ).toEqual({
      index: 1,
      count: 2,
    });
  });

  it("moves child blocks within the same list item container", () => {
    const document = createDefaultResumeDocument();
    const profileSection = document.sections[0];
    const listBlock = profileSection?.blocks[1];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected the profile highlights block to stay a list.");
    }

    listBlock.items[0] = {
      ...listBlock.items[0],
      children: [
        listBlock.items[0]!.children[0]!,
        {
          id: "item-foundation-1-detail",
          type: "text",
          content: richText("Extra detail"),
        },
      ],
    };

    const updated = moveBlockInDocument({
      document,
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-detail",
      ],
      toIndex: 0,
    });
    const updatedListBlock = updated.sections[0]?.blocks[1];

    expect(updatedListBlock?.type).toBe("list");

    if (updatedListBlock?.type !== "list") {
      throw new Error("Expected the profile highlights block to stay a list.");
    }

    expect(updatedListBlock.items[0]?.children.map((block) => block.id)).toEqual([
      "item-foundation-1-detail",
      "item-foundation-1-text",
    ]);
  });

  it("prunes empty structural containers after deleting their final leaf", () => {
    const document = createDefaultResumeDocument();
    const profileSection = document.sections[0]!;

    profileSection.blocks = [
      {
        id: "outer-group",
        type: "group",
        direction: "vertical",
        children: [
          {
            id: "emptyable-row",
            type: "row",
            children: [
              {
                id: "only-child",
                type: "text",
                content: richText("Only child"),
              },
            ],
          },
        ],
      },
    ];

    const updated = removeBlockFromDocument({
      document,
      sectionId: profileSection.id,
      blockPath: ["outer-group", "emptyable-row", "only-child"],
    });

    expect(updated.sections[0]?.blocks).toEqual([]);
  });

  it("prunes an empty list and its structural ancestors after deleting its final item", () => {
    const document = createDefaultResumeDocument();
    const profileSection = document.sections[0]!;

    profileSection.blocks = [
      {
        id: "outer-group",
        type: "group",
        direction: "vertical",
        children: [
          {
            id: "only-list",
            type: "list",
            items: [
              {
                id: "only-item",
                children: [
                  {
                    id: "only-text",
                    type: "text",
                    content: richText("Only item"),
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const updated = removeListItemFromDocument({
      document,
      sectionId: profileSection.id,
      listPath: ["outer-group", "only-list"],
      itemId: "only-item",
    });

    expect(updated.sections[0]?.blocks).toEqual([]);
  });
});
