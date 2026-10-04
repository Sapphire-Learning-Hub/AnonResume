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
});
