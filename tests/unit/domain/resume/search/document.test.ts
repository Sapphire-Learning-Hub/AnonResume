import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { findBlockByPath } from "@/domain/resume/block-tree";
import {
  resumeDocumentSchema,
  type RichTextContent,
  type TextBlock,
} from "@/domain/resume/schema";
import {
  findResumeMatches,
  replaceResumeMatches,
} from "@/domain/resume/search/document";

const rich = (text: string): RichTextContent => ({
  type: "doc",
  content: [
    { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
  ],
});
const textBlock = (id: string, text: string): TextBlock => ({
  id,
  type: "text",
  content: rich(text),
});
const query = { text: "needle", caseSensitive: false };
function fixture() {
  const document = createDefaultResumeDocument();
  document.schemaVersion = 2;
  document.meta.title = "needle internal name";
  document.sections = [
    {
      id: "visible",
      visible: true,
      title: rich("needle title"),
      layout: { columns: 2, gap: 12 },
      blocks: [
        {
          id: "row",
          type: "row",
          children: [
            {
              id: "group",
              type: "group",
              direction: "vertical",
              children: [textBlock("nested", "needle text")],
            },
          ],
        },
        {
          id: "list",
          type: "list",
          items: [
            { id: "item", children: [textBlock("list-text", "needle item")] },
          ],
        },
        {
          id: "badges",
          type: "badges",
          wrap: true,
          gap: 8,
          items: [
            { id: "badge", text: "needle" },
            { id: "other-badge", text: "unchanged" },
          ],
        },
        {
          id: "image",
          type: "image",
          assetId: "77290b34-3285-42ac-8d50-e925680e4eed",
          alt: "needle alt",
          intrinsicWidth: 100,
          intrinsicHeight: 100,
          width: 100,
          height: 100,
          fit: "cover",
          positionX: 50,
          positionY: 50,
          radius: 0,
          align: "right",
        },
        {
          id: "unrelated",
          type: "group",
          direction: "vertical",
          children: [textBlock("empty", "")],
        },
        {
          ...textBlock("link", "display"),
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "display",
                    marks: [
                      {
                        type: "link",
                        attrs: { href: "mailto:needle@example.test" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "hidden",
      visible: false,
      title: rich("needle hidden"),
      blocks: [textBlock("hidden-text", "needle")],
    },
  ];
  return document;
}

it("searches visible nested user text in document order without matching metadata, image alt, links or hidden sections", () => {
  const found = findResumeMatches(fixture(), query);
  expect(
    found.map(({ field, blockPath, badgeItemId }) => [
      field,
      blockPath,
      badgeItemId,
    ]),
  ).toEqual([
    ["title", [], undefined],
    ["content", ["row", "group", "nested"], undefined],
    ["content", ["list", "item", "list-text"], undefined],
    ["badge", ["badges"], "badge"],
  ]);
  expect(new Set(found.map((match) => match.key)).size).toBe(4);
});

it("replaces all matches while retaining identities, layout, images, links and hidden content", () => {
  const original = fixture();
  const result = replaceResumeMatches(original, query, "replacement");
  expect(result.count).toBe(4);
  expect(findResumeMatches(result.document, query)).toEqual([]);
  expect(result.document.meta).toBe(original.meta);
  expect(result.document.settings).toBe(original.settings);
  expect(result.document.sections[0]!.layout).toBe(
    original.sections[0]!.layout,
  );
  for (const id of ["image", "unrelated", "link"])
    expect(findBlockByPath(result.document.sections[0]!.blocks, [id])).toBe(
      findBlockByPath(original.sections[0]!.blocks, [id]),
    );
  expect(result.document.sections[1]).toBe(original.sections[1]);
  expect(resumeDocumentSchema.safeParse(result.document).success).toBe(true);
});

it("replaces one selected match and returns original document for no-op or missing results", () => {
  const original = fixture();
  const selected = findResumeMatches(original, query)[2]!;
  const result = replaceResumeMatches(original, query, "changed", selected.key);
  expect(result.count).toBe(1);
  expect(findResumeMatches(result.document, query)).toHaveLength(3);
  expect(replaceResumeMatches(original, query, "needle")).toEqual({
    document: original,
    count: 0,
  });
  expect(replaceResumeMatches(original, query, "changed", "unknown")).toEqual({
    document: original,
    count: 0,
  });
});

it("deletes empty badge items and cleans only ancestors made empty by that removal", () => {
  const original = fixture();
  original.sections[0]!.blocks.unshift({
    id: "outer",
    type: "group",
    direction: "vertical",
    children: [
      {
        id: "only-badges",
        type: "badges",
        wrap: false,
        items: [{ id: "only", text: "needle" }],
      },
    ],
  });
  const result = replaceResumeMatches(original, query, "");
  expect(result.count).toBe(5);
  const blocks = result.document.sections[0]!.blocks;
  expect(findBlockByPath(blocks, ["outer"])).toBeUndefined();
  expect(findBlockByPath(blocks, ["badges"])).toMatchObject({
    items: [{ id: "other-badge", text: "unchanged" }],
  });
  expect(findBlockByPath(blocks, ["unrelated"])).toBe(
    findBlockByPath(original.sections[0]!.blocks, ["unrelated"]),
  );
  expect(resumeDocumentSchema.safeParse(result.document).success).toBe(true);
});
