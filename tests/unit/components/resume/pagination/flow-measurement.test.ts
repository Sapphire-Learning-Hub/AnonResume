import { afterEach, describe, expect, it, vi } from "vitest";

import { measureResumeFlow } from "@/components/resume/pagination/flow-measurement";
import type { TiptapTextBlockEditorHandle } from "@/components/resume/TiptapTextBlockEditor";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type { ResumeDocument } from "@/domain/resume/schema";

describe("measureResumeFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("subtracts a structural spacer once and normalizes measurements by zoom", () => {
    const document = documentWithBlocks([
      {
        id: "group",
        type: "group",
        direction: "vertical",
        gap: 10,
        children: [textBlock("first", "First"), textBlock("second", "Second")],
      },
    ]);
    const root = createSectionRoot(2);
    const group = appendMeasuredElement(root, "div", {
      "data-resume-block-path": "group",
      "data-height": "160",
    });
    appendMeasuredElement(group, "div", {
      "data-resume-block-path": "group::first",
      "data-height": "40",
    });
    appendMeasuredElement(group, "span", {
      "data-resume-page-break-id": "break-1",
      "data-height": "40",
    });
    appendMeasuredElement(group, "div", {
      "data-resume-block-path": "group::second",
      "data-height": "40",
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 2,
      committedSpacerHeights: new Map([["break-1", 20]]),
    });

    expect(measured?.[0]?.blocks[0]).toMatchObject({
      path: ["group"],
      height: 60,
      wrapperHeight: 10,
      children: [
        { path: ["group", "first"], height: 20 },
        { path: ["group", "second"], height: 20 },
      ],
    });
  });

  it("preserves fractional DOM heights instead of accumulating rounded pixels", () => {
    const document = documentWithBlocks([textBlock("summary", "Summary")]);
    const root = createSectionRoot(1);
    const section = root.querySelector<HTMLElement>(
      '[data-resume-section-id="section"]',
    );

    section?.setAttribute("data-height", "100.25");
    appendMeasuredElement(root, "div", {
      "data-resume-block-path": "summary",
      "data-height": "20.25",
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map(),
    });

    expect(measured?.[0]?.height).toBe(100.25);
    expect(measured?.[0]?.blocks[0]?.height).toBe(20.25);
  });

  it("subtracts multiple list spacers without charging them to list items", () => {
    const document = documentWithBlocks([
      {
        id: "list",
        type: "list",
        gap: 5,
        items: [
          { id: "item-a", children: [textBlock("text-a", "A")] },
          { id: "item-b", children: [textBlock("text-b", "B")] },
        ],
      },
    ]);
    const root = createSectionRoot(1);
    const list = appendMeasuredElement(root, "div", {
      "data-resume-block-path": "list",
      "data-height": "105",
    });
    const itemA = appendMeasuredElement(list, "div", {
      "data-resume-list-item-path": "list::item-a",
      "data-height": "30",
    });
    appendMeasuredElement(itemA, "div", {
      "data-resume-block-path": "list::item-a::text-a",
      "data-height": "30",
    });
    appendMeasuredElement(list, "span", {
      "data-resume-page-break-id": "break-a",
      "data-height": "10",
    });
    appendMeasuredElement(list, "span", {
      "data-resume-page-break-id": "break-b",
      "data-height": "15",
    });
    const itemB = appendMeasuredElement(list, "div", {
      "data-resume-list-item-path": "list::item-b",
      "data-height": "30",
    });
    appendMeasuredElement(itemB, "div", {
      "data-resume-block-path": "list::item-b::text-b",
      "data-height": "30",
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map([
        ["break-a", 10],
        ["break-b", 15],
      ]),
    });

    expect(measured?.[0]?.blocks[0]).toMatchObject({
      height: 80,
      wrapperHeight: 15,
      children: [
        { height: 30, wrapperHeight: 0 },
        { height: 30, wrapperHeight: 0 },
      ],
    });
  });

  it("distributes the active Tiptap line box height across measured lines", () => {
    const document = documentWithBlocks([textBlock("summary", "abcdefghij")]);
    const root = createSectionRoot(1);
    appendMeasuredElement(root, "div", {
      "data-resume-block-path": "summary",
      "data-height": "48",
    });
    const activeEditor = {
      measureRichTextLines: vi.fn(() => [
        {
          from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
          to: { paragraphIndex: 0, nodeIndex: 0, offset: 5 },
          height: 20,
        },
        {
          from: { paragraphIndex: 0, nodeIndex: 0, offset: 5 },
          to: { paragraphIndex: 0, nodeIndex: 0, offset: 10 },
          height: 20,
        },
      ]),
    } as unknown as TiptapTextBlockEditorHandle;

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      activeEditor,
      activeSelection: {
        sectionId: "section",
        blockPath: ["summary"],
        richTextField: "content",
      },
      committedSpacerHeights: new Map(),
    });

    expect(activeEditor.measureRichTextLines).toHaveBeenCalledOnce();
    expect(measured?.[0]?.blocks[0]).toMatchObject({
      height: 48,
      leadingHeight: 0,
      trailingHeight: 0,
      textLines: [
        { height: 24 },
        { height: 24 },
      ],
    });
  });

  it("measures static rich-text lines from stable node attributes", () => {
    const document = documentWithBlocks([textBlock("summary", "abcd")]);
    const root = createSectionRoot(1);
    const block = appendMeasuredElement(root, "div", {
      "data-resume-block-path": "summary",
      "data-height": "40",
    });
    const text = appendMeasuredElement(block, "span", {
      "data-resume-rich-paragraph-index": "0",
      "data-resume-rich-node-index": "0",
      "data-resume-rich-node-type": "text",
      "data-height": "40",
    });
    text.textContent = "abcd";
    stubRangeRects(({ start, end }) => {
      if (start === end) {
        return start <= 2
          ? { top: 0, bottom: 20, left: start * 5, right: start * 5 }
          : {
              top: 20,
              bottom: 40,
              left: (start - 2) * 5,
              right: (start - 2) * 5,
            };
      }

      return start < 2
        ? { top: 0, bottom: 20, left: start * 5, right: end * 5 }
        : {
            top: 20,
            bottom: 40,
            left: (start - 2) * 5,
            right: (end - 2) * 5,
          };
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map(),
    });

    expect(measured?.[0]?.blocks[0]?.textLines).toEqual([
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

  it("keeps middle empty paragraphs in their measured text position", () => {
    const document = documentWithBlocks([
      {
        id: "summary",
        type: "text",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A" }],
            },
            { type: "paragraph", content: [] },
            {
              type: "paragraph",
              content: [{ type: "text", text: "B" }],
            },
          ],
        },
      },
    ]);
    const root = createSectionRoot(1);
    const block = appendMeasuredElement(root, "div", {
      "data-resume-block-path": "summary",
      "data-height": "60",
    });
    const first = appendMeasuredElement(block, "span", {
      "data-resume-rich-paragraph-index": "0",
      "data-resume-rich-node-index": "0",
      "data-resume-rich-node-type": "text",
    });
    first.textContent = "A";
    const emptyParagraph = appendMeasuredElement(block, "p", {
      "data-resume-rich-empty-paragraph": "true",
      "data-resume-rich-paragraph-index": "1",
    });
    appendMeasuredElement(emptyParagraph, "br", {
      "data-height": "20",
      "data-top": "20",
    });
    const last = appendMeasuredElement(block, "span", {
      "data-resume-rich-paragraph-index": "2",
      "data-resume-rich-node-index": "0",
      "data-resume-rich-node-type": "text",
    });
    last.textContent = "B";
    let characterIndex = 0;
    stubRangeRects(() => {
      const top = characterIndex === 0 ? 0 : 40;
      characterIndex += 1;
      return { top, bottom: top + 20, left: 0, right: 5 };
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map(),
    });

    expect(measured?.[0]?.blocks[0]).toMatchObject({
      trailingHeight: 0,
      textLines: [
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
      ],
    });
  });

  it("does not charge an inline page spacer to an atomic rich-text node", () => {
    const document = documentWithBlocks([
      {
        id: "contact",
        type: "text",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "resumeIcon",
                  attrs: { iconId: "lucide:mail" },
                },
              ],
            },
          ],
        },
      },
    ]);
    const root = createSectionRoot(1);
    const block = appendMeasuredElement(root, "div", {
      "data-resume-block-path": "contact",
      "data-height": "100",
    });
    const atomic = appendMeasuredElement(block, "span", {
      "data-resume-rich-paragraph-index": "0",
      "data-resume-rich-node-index": "0",
      "data-resume-rich-node-type": "resumeIcon",
      "data-height": "100",
    });
    appendMeasuredElement(atomic, "span", {
      "data-resume-page-break-id": "inline-break",
      "data-height": "80",
    });
    appendMeasuredElement(atomic, "span", {
      "data-resume-icon-id": "lucide:mail",
      "data-height": "20",
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map([["inline-break", 80]]),
    });

    expect(measured?.[0]?.blocks[0]?.textLines).toEqual([
      {
        from: { paragraphIndex: 0, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: 0, nodeIndex: 0, offset: 1 },
        height: 20,
      },
    ]);
  });

  it("tolerates a legacy zero-height row whose text children are empty", () => {
    const document = documentWithBlocks([
      {
        id: "empty-row",
        type: "row",
        children: [
          textBlock("empty-left", ""),
          textBlock("empty-right", ""),
        ],
      },
    ]);
    const root = createSectionRoot(1);
    appendMeasuredElement(root, "div", {
      "data-resume-block-path": "empty-row",
      "data-height": "0",
    });

    const measured = measureResumeFlow({
      root,
      document,
      zoom: 1,
      committedSpacerHeights: new Map(),
    });

    expect(measured?.[0]?.blocks).toEqual([
      expect.objectContaining({
        path: ["empty-row"],
        type: "row",
        height: 0,
      }),
    ]);
  });

  it("returns undefined instead of a partial result when a required block is missing", () => {
    const document = documentWithBlocks([
      textBlock("present", "Present"),
      textBlock("missing", "Missing"),
    ]);
    const root = createSectionRoot(1);
    appendMeasuredElement(root, "div", {
      "data-resume-block-path": "present",
      "data-height": "20",
    });

    expect(
      measureResumeFlow({
        root,
        document,
        zoom: 1,
        committedSpacerHeights: new Map(),
      }),
    ).toBeUndefined();
  });
});

function documentWithBlocks(
  blocks: ResumeDocument["sections"][number]["blocks"],
): ResumeDocument {
  const document = createDefaultResumeDocument();

  return {
    ...document,
    sections: [
      {
        id: "section",
        visible: true,
        blocks,
      },
    ],
  };
}

function textBlock(id: string, text: string) {
  return {
    id,
    type: "text" as const,
    content: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text }],
        },
      ],
    },
  };
}

function createSectionRoot(zoom: number) {
  const root = document.createElement("div");
  const section = appendMeasuredElement(root, "section", {
    "data-resume-section-id": "section",
    "data-height": String(500 * zoom),
  });

  document.body.append(root);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      return rect(
        Number(this.dataset.height ?? 0),
        Number(this.dataset.top ?? 0),
      );
    },
  );

  return section.parentElement as HTMLElement;
}

function appendMeasuredElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  attributes: Record<string, string>,
) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  parent.append(element);
  return element;
}

function rect(height: number, top = 0) {
  return {
    x: 0,
    y: top,
    top,
    right: 100,
    bottom: top + height,
    left: 0,
    width: 100,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubRangeRects(
  resolve: (range: {
    start: number;
    end: number;
  }) => Pick<DOMRect, "top" | "bottom" | "left" | "right">,
) {
  vi.spyOn(document, "createRange").mockImplementation(() => {
    let start = 0;
    let end = 0;

    return {
      setStart: (_node: Node, nextOffset: number) => {
        start = nextOffset;
      },
      setEnd: (_node: Node, nextOffset: number) => {
        end = nextOffset;
      },
      collapse: () => undefined,
      getBoundingClientRect: () => {
        const value = resolve({ start, end });
        return {
          ...rect(value.bottom - value.top),
          ...value,
          width: value.right - value.left,
          height: value.bottom - value.top,
        };
      },
    } as unknown as Range;
  });
}
