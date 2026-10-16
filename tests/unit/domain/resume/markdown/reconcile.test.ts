import { reconcileResumeMarkdown } from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";

function text(id: string, value: string, style?: Extract<ResumeBlock, { type: "text" }>["style"]): ResumeBlock {
  return {
    id,
    type: "text",
    content: createRichTextFromPlainText(value),
    ...(style ? { style } : {}),
  };
}

function documentWithBlocks(blocks: ResumeBlock[]): ResumeDocument {
  const base = createDefaultResumeDocument("zh-CN");
  return {
    ...base,
    meta: {
      ...base.meta,
      import: {
        format: "markdown",
        dialect: "standard",
        importedAt: "2026-10-16T00:00:00.000Z",
        originalSource: "# original",
        diagnostics: [],
      },
    },
    sections: [
      {
        id: "section-original",
        title: createRichTextFromPlainText("经历"),
        semantic: "experience",
        visible: true,
        blocks,
      },
    ],
  };
}

describe("reconcileResumeMarkdown", () => {
  it("preserves unique node identity and omitted private properties after reorder", () => {
    const base = documentWithBlocks([
      text("alpha", "Alpha", { color: "#111827" }),
      text("beta", "Beta", { tone: "muted" }),
    ]);
    const parsed = documentWithBlocks([
      text("alpha", "Beta"),
      text("beta", "Alpha"),
    ]);
    parsed.meta = { title: base.meta.title, locale: "zh-CN" };

    const reconciled = reconcileResumeMarkdown(base, parsed, {
      document: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      sections: [],
      blocks: [],
    });

    expect(reconciled.sections[0]?.id).toBe("section-original");
    expect(reconciled.sections[0]?.blocks).toEqual([
      text("beta", "Beta", { tone: "muted" }),
      text("alpha", "Alpha", { color: "#111827" }),
    ]);
    expect(reconciled.meta.import).toEqual(base.meta.import);
  });

  it("matches duplicate siblings by occurrence and gives inserted nodes fresh identity", () => {
    const base = documentWithBlocks([
      text("duplicate-1", "Same", { tone: "muted" }),
      text("duplicate-2", "Same", { align: "right" }),
      text("removed", "Remove me"),
    ]);
    const parsed = documentWithBlocks([
      text("position-1", "Same"),
      text("position-2", "Same"),
      text("new-markdown-1", "Inserted"),
    ]);

    const reconciled = reconcileResumeMarkdown(base, parsed, {
      document: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } },
      sections: [],
      blocks: [],
    });
    const blocks = reconciled.sections[0]!.blocks;

    expect(blocks[0]).toEqual(text("duplicate-1", "Same", { tone: "muted" }));
    expect(blocks[1]).toEqual(text("duplicate-2", "Same", { align: "right" }));
    expect(blocks[2]?.id).toBe("new-markdown-1");
    expect(blocks.some((block) => block.id === "removed")).toBe(false);
  });

  it("recursively reconciles list items and nested containers", () => {
    const base = documentWithBlocks([
      {
        id: "group-base",
        type: "group",
        direction: "vertical",
        gap: 8,
        align: "stretch",
        children: [
          {
            id: "list-base",
            type: "list",
            marker: "square",
            gap: 6,
            items: [
              { id: "item-base", children: [text("item-text", "Nested")] },
            ],
          },
        ],
      },
    ]);
    const parsed = documentWithBlocks([
      {
        id: "group-position",
        type: "group",
        direction: "vertical",
        children: [
          {
            id: "list-position",
            type: "list",
            items: [
              { id: "item-position", children: [text("text-position", "Nested")] },
            ],
          },
        ],
      },
    ]);
    const reconciled = reconcileResumeMarkdown(base, parsed, {
      document: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      sections: [],
      blocks: [],
    });

    expect(reconciled.sections[0]?.blocks[0]).toMatchObject({
      id: "group-base",
      type: "group",
      gap: 8,
      align: "stretch",
      children: [
        {
          id: "list-base",
          type: "list",
          marker: "square",
          gap: 6,
          items: [
            {
              id: "item-base",
              children: [{ id: "item-text", type: "text" }],
            },
          ],
        },
      ],
    });
  });
});
