import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

import type { RichTextContent } from "@/domain/resume/schema";
import { measureTiptapRichTextLines, resolveRichTextPosition } from "@/components/resume/pagination/tiptap-page-breaks";

describe("measureTiptapRichTextLines", () => {
  it("keeps source node positions when ProseMirror merges adjacent text", () => {
    const schema = new Schema({ nodes: {
      doc: { content: "paragraph+" }, paragraph: { content: "inline*" },
      text: { group: "inline" }, hardBreak: { inline: true, group: "inline" },
    } });
    const source: RichTextContent = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "ab" }, { type: "text", text: "cd" }, { type: "hardBreak" },
    ] }] };
    const doc = schema.nodeFromJSON(source);
    expect(doc.firstChild?.childCount).toBe(2);
    const editor = { state: { doc }, view: { coordsAtPos: (pos: number) => ({
      top: pos < 3 ? 0 : pos < 6 ? 20 : 40, bottom: pos < 3 ? 20 : pos < 6 ? 40 : 60,
    }) } } as unknown as Editor;
    const lines = measureTiptapRichTextLines(editor, source);
    expect(lines).toEqual([
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 }, to: { paragraphIndex: 0, nodeIndex: 0, offset: 2 }, height: 20 },
      { from: { paragraphIndex: 0, nodeIndex: 1, offset: 0 }, to: { paragraphIndex: 0, nodeIndex: 2, offset: 1 }, height: 20 },
      { from: { paragraphIndex: 0, nodeIndex: 3, offset: 0 }, to: { paragraphIndex: 1, nodeIndex: 0, offset: 0 }, height: 20 },
    ]);
    expect(resolveRichTextPosition(doc, lines![1]!.from, source)).toBe(3);
    expect(resolveRichTextPosition(doc, lines![2]!.from, source)).toBe(6);
    expect(resolveRichTextPosition(doc, { paragraphIndex: 0, nodeIndex: 1, offset: 3 }, source)).toBeUndefined();
  });

  it("maps source positions across icons and paragraphs and rejects stale lengths", () => {
    const schema = new Schema({ nodes: {
      doc: { content: "paragraph+" }, paragraph: { content: "inline*" },
      text: { group: "inline" }, hardBreak: { inline: true, group: "inline" },
      resumeIcon: { inline: true, group: "inline", atom: true, attrs: { iconId: {} } },
    } });
    const source: RichTextContent = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "A" }, { type: "text", text: "B" }, { type: "resumeIcon", attrs: { iconId: "mail" } }, { type: "text", text: "C" }] },
      { type: "paragraph", content: [] },
    ] };
    const doc = schema.nodeFromJSON(source);
    expect(resolveRichTextPosition(doc, { paragraphIndex: 0, nodeIndex: 2, offset: 0 }, source)).toBe(3);
    expect(resolveRichTextPosition(doc, { paragraphIndex: 0, nodeIndex: 3, offset: 1 }, source)).toBe(5);
    expect(resolveRichTextPosition(doc, { paragraphIndex: 1, nodeIndex: 0, offset: 0 }, source)).toBe(7);
    const editor = { state: { doc }, view: { coordsAtPos: () => ({ top: 0, bottom: 20 }) } } as unknown as Editor;
    const stale = structuredClone(source);
    stale.content[0]!.content.push({ type: "text", text: "pending update" });
    expect(measureTiptapRichTextLines(editor, stale)).toBeUndefined();
    expect(resolveRichTextPosition(doc, { paragraphIndex: 0, nodeIndex: 2, offset: 0 }, stale)).toBeUndefined();
    stale.content.pop();
    expect(measureTiptapRichTextLines(editor, stale)).toBeUndefined();
  });

  it("measures the caret line after a paragraph's final hard break", () => {
    const schema = new Schema({ nodes: {
      doc: { content: "paragraph+" }, paragraph: { content: "inline*" },
      text: { group: "inline" }, hardBreak: { inline: true, group: "inline" },
    } });
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("A"), schema.node("hardBreak")])]);
    const editor = { state: { doc }, view: { coordsAtPos: (pos: number) => ({
      top: pos === 3 ? 20 : 0, bottom: pos === 3 ? 40 : 20, left: 0, right: 0,
    }) } } as unknown as Editor;
    expect(measureTiptapRichTextLines(editor)).toEqual([
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 }, to: { paragraphIndex: 0, nodeIndex: 1, offset: 1 }, height: 20 },
      { from: { paragraphIndex: 0, nodeIndex: 2, offset: 0 }, to: { paragraphIndex: 1, nodeIndex: 0, offset: 0 }, height: 20 },
    ]);
  });
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

  it("keeps an inline icon and differently sized text on the same visual line", () => {
    const nodes = [
      { isText: true, text: "A", nodeSize: 1 },
      { isText: false, nodeSize: 1 },
      { isText: true, text: "BC", nodeSize: 2 },
    ];
    const editor = {
      state: { doc: { childCount: 1, child: () => ({ childCount: nodes.length, child: (index: number) => nodes[index], nodeSize: 6 }) } },
      view: { coordsAtPos: (position: number) => {
        const top = position === 2 ? 2.25 : position === 4 ? 20 : 0;
        return { top, bottom: top + (position === 2 ? 14 : 18.5), left: 0, right: 0 };
      } },
    } as unknown as Editor;
    expect(measureTiptapRichTextLines(editor)).toEqual([
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 }, to: { paragraphIndex: 0, nodeIndex: 2, offset: 1 }, height: 19 },
      { from: { paragraphIndex: 0, nodeIndex: 2, offset: 1 }, to: { paragraphIndex: 0, nodeIndex: 2, offset: 2 }, height: 19 },
    ]);
  });

  it("measures a final empty paragraph instead of discarding its line", () => {
    const editor = {
      state: { doc: { childCount: 1, child: () => ({ childCount: 0, nodeSize: 2 }) } },
      view: { coordsAtPos: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) },
    } as unknown as Editor;
    expect(measureTiptapRichTextLines(editor)).toEqual([
      { from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 }, to: { paragraphIndex: 1, nodeIndex: 0, offset: 0 }, height: 20 },
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
