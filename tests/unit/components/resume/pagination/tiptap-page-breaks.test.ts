import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import { measureTiptapRichTextLines } from "@/components/resume/pagination/tiptap-page-breaks";

describe("measureTiptapRichTextLines", () => {
  it("measures the rendered character after an ambiguous wrapped caret", () => {
    const textNode = {
      isText: true,
      nodeSize: 4,
      text: "abcd",
    };
    const paragraph = {
      childCount: 1,
      child: () => textNode,
      nodeSize: 6,
    };
    const coordsAtPos = vi.fn((position: number, side?: number) => {
      const actualCharacterTop = position < 3 ? 0 : 20;
      const ambiguousCaretTop = position <= 3 ? 0 : 20;
      const top = side === 1 ? actualCharacterTop : ambiguousCaretTop;

      return { top, bottom: top + 20, left: 0, right: 0 };
    });
    const editor = {
      state: {
        doc: {
          childCount: 1,
          child: () => paragraph,
        },
      },
      view: { coordsAtPos },
    } as unknown as Editor;

    expect(measureTiptapRichTextLines(editor)).toEqual([
      {
        from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: 0, nodeIndex: 0, offset: 2 },
        height: 20,
      },
      {
        from: { paragraphIndex: 0, nodeIndex: 0, offset: 2 },
        to: { paragraphIndex: 0, nodeIndex: 0, offset: 4 },
        height: 20,
      },
    ]);
  });

  it("measures an empty paragraph between two text paragraphs", () => {
    const textNode = {
      isText: true,
      nodeSize: 1,
      text: "A",
    };
    const paragraphs = [
      {
        childCount: 1,
        child: () => textNode,
        nodeSize: 3,
      },
      {
        childCount: 0,
        child: () => undefined,
        nodeSize: 2,
      },
      {
        childCount: 1,
        child: () => ({ ...textNode, text: "B" }),
        nodeSize: 3,
      },
    ];
    const coordsAtPos = vi.fn((position: number) => {
      const top = position === 1 ? 0 : position === 4 ? 20 : 40;
      return { top, bottom: top + 20, left: 0, right: 0 };
    });
    const editor = {
      state: {
        doc: {
          childCount: paragraphs.length,
          child: (index: number) => paragraphs[index],
        },
      },
      view: { coordsAtPos },
    } as unknown as Editor;

    expect(measureTiptapRichTextLines(editor)).toEqual([
      {
        from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: 0, nodeIndex: 0, offset: 1 },
        height: 20,
      },
      {
        from: { paragraphIndex: 1, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: 2, nodeIndex: 0, offset: 0 },
        height: 20,
      },
      {
        from: { paragraphIndex: 2, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: 2, nodeIndex: 0, offset: 1 },
        height: 20,
      },
    ]);
  });
});
