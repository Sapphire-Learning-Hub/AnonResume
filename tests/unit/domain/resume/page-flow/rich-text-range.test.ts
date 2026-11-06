import { describe, expect, it } from "vitest";

import {
  compareRichTextPositions,
  sliceRichTextContent,
  splitRichTextContent,
  type RichTextPosition,
} from "@/domain/resume/page-flow/rich-text-range";
import {
  richTextContentSchema,
  type RichTextContent,
} from "@/domain/resume/schema";

const content: RichTextContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "AlphaBeta",
          marks: [
            { type: "bold" },
            { type: "link", attrs: { href: "https://example.com" } },
          ],
        },
        { type: "hardBreak" },
        { type: "resumeIcon", attrs: { iconId: "lucide:mail" } },
        { type: "text", text: "Tail", marks: [{ type: "italic" }] },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Second" }],
    },
  ],
};

function expectValidSlices(slices: RichTextContent[]) {
  for (const slice of slices) {
    expect(richTextContentSchema.safeParse(slice).success).toBe(true);

    for (const paragraph of slice.content) {
      for (const node of paragraph.content) {
        if (node.type === "text") {
          expect(node.text).not.toBe("");
        }
      }
    }
  }
}

describe("rich text pagination ranges", () => {
  it("preserves the empty line after a terminal soft break when it starts the next page", () => {
    const source: RichTextContent = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }, { type: "hardBreak" }] },
      { type: "paragraph", content: [{ type: "text", text: "B" }] },
    ] };
    expect(sliceRichTextContent(source, {
      from: { paragraphIndex: 0, nodeIndex: 2, offset: 0 },
      to: { paragraphIndex: 1, nodeIndex: 1, offset: 0 },
    }).content).toEqual([{ type: "paragraph", content: [] }, source.content[1]]);
    const terminal: RichTextContent = { ...source, content: [source.content[0]!] };
    expect(splitRichTextContent(terminal, [{ paragraphIndex: 0, nodeIndex: 2, offset: 0 }])).toHaveLength(2);
  });
  it("orders positions by paragraph, node, and offset", () => {
    expect(
      compareRichTextPositions(
        { paragraphIndex: 0, nodeIndex: 0, offset: 4 },
        { paragraphIndex: 0, nodeIndex: 0, offset: 5 },
      ),
    ).toBeLessThan(0);
    expect(
      compareRichTextPositions(
        { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
        { paragraphIndex: 0, nodeIndex: 4, offset: 0 },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareRichTextPositions(
        { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
        { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
      ),
    ).toBe(0);
  });

  it("slices within marked text without losing marks", () => {
    const slice = sliceRichTextContent(content, {
      from: { paragraphIndex: 0, nodeIndex: 0, offset: 5 },
      to: { paragraphIndex: 0, nodeIndex: 0, offset: 9 },
    });

    expect(slice).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Beta",
              marks: [
                { type: "bold" },
                { type: "link", attrs: { href: "https://example.com" } },
              ],
            },
          ],
        },
      ],
    });
    expectValidSlices([slice]);
  });

  it("preserves hard breaks and icons at atomic boundaries", () => {
    const beforeIcon = sliceRichTextContent(content, {
      from: { paragraphIndex: 0, nodeIndex: 1, offset: 0 },
      to: { paragraphIndex: 0, nodeIndex: 2, offset: 0 },
    });
    const icon = sliceRichTextContent(content, {
      from: { paragraphIndex: 0, nodeIndex: 2, offset: 0 },
      to: { paragraphIndex: 0, nodeIndex: 2, offset: 1 },
    });

    expect(beforeIcon.content[0]?.content).toEqual([{ type: "hardBreak" }]);
    expect(icon.content[0]?.content).toEqual([
      { type: "resumeIcon", attrs: { iconId: "lucide:mail" } },
    ]);
    expectValidSlices([beforeIcon, icon]);
  });

  it("splits at paragraph boundaries without synthetic empty paragraphs", () => {
    const slices = splitRichTextContent(content, [
      { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
    ]);

    expect(slices).toHaveLength(2);
    expect(slices[0]?.content).toEqual([content.content[0]]);
    expect(slices[1]?.content).toEqual([content.content[1]]);
    expectValidSlices(slices);
  });

  it("keeps a real empty paragraph at the start of a continuation", () => {
    const contentWithLeadingEmptyParagraph: RichTextContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }],
        },
      ],
    };

    const slice = sliceRichTextContent(contentWithLeadingEmptyParagraph, {
      from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
      to: { paragraphIndex: 1, nodeIndex: 0, offset: 5 },
    });

    expect(slice).toEqual(contentWithLeadingEmptyParagraph);
    expectValidSlices([slice]);
  });

  it("splits around an icon and deduplicates repeated break positions", () => {
    const beforeIcon: RichTextPosition = {
      paragraphIndex: 0,
      nodeIndex: 2,
      offset: 0,
    };
    const afterIcon: RichTextPosition = {
      paragraphIndex: 0,
      nodeIndex: 2,
      offset: 1,
    };
    const slices = splitRichTextContent(content, [
      beforeIcon,
      beforeIcon,
      afterIcon,
    ]);

    expect(slices).toHaveLength(3);
    expect(slices[1]?.content[0]?.content).toEqual([
      { type: "resumeIcon", attrs: { iconId: "lucide:mail" } },
    ]);
    expect(slices[0]?.content[0]?.content.at(-1)).toEqual({
      type: "hardBreak",
    });
    expect(slices[2]?.content[0]?.content[0]).toEqual({
      type: "text",
      text: "Tail",
      marks: [{ type: "italic" }],
    });
    expectValidSlices(slices);
  });

  it("does not add a blank fragment for a split after the final text", () => {
    const single: RichTextContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] };
    expect(splitRichTextContent(single, [{ paragraphIndex: 0, nodeIndex: 0, offset: 1 }])).toEqual([single]);
  });

  it("retains every trailing empty paragraph when splitting a document", () => {
    const trailing: RichTextContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "AB" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [] },
      ],
    };
    const slices = splitRichTextContent(trailing, [
      { paragraphIndex: 0, nodeIndex: 0, offset: 1 },
      { paragraphIndex: 2, nodeIndex: 0, offset: 0 },
    ]);
    expect(slices.map((slice) => slice.content)).toEqual([
      [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
      [{ type: "paragraph", content: [{ type: "text", text: "B" }] }, { type: "paragraph", content: [] }],
      [{ type: "paragraph", content: [] }],
    ]);
    expect(splitRichTextContent(trailing, [])).toEqual([trailing]);
    expectValidSlices(slices);
  });

  it("returns one valid empty paragraph for an empty range", () => {
    const position = { paragraphIndex: 0, nodeIndex: 1, offset: 0 };
    const slice = sliceRichTextContent(content, {
      from: position,
      to: position,
    });

    expect(slice).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
    expectValidSlices([slice]);
  });

  it.each([
    {
      name: "negative paragraph index",
      from: { paragraphIndex: -1, nodeIndex: 0, offset: 0 },
      to: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
    },
    {
      name: "text offset past the node",
      from: { paragraphIndex: 0, nodeIndex: 0, offset: 99 },
      to: { paragraphIndex: 0, nodeIndex: 1, offset: 0 },
    },
    {
      name: "atomic offset past one",
      from: { paragraphIndex: 0, nodeIndex: 1, offset: 2 },
      to: { paragraphIndex: 0, nodeIndex: 2, offset: 0 },
    },
    {
      name: "reversed range",
      from: { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
      to: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
    },
  ])("rejects $name", ({ from, to }) => {
    expect(() => sliceRichTextContent(content, { from, to })).toThrow(
      RangeError,
    );
  });

  it("rejects out-of-order split positions", () => {
    expect(() =>
      splitRichTextContent(content, [
        { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
        { paragraphIndex: 0, nodeIndex: 0, offset: 4 },
      ]),
    ).toThrow(RangeError);
  });
});
