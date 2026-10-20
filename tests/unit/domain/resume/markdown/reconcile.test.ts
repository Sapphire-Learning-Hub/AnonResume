import {
  applyResumeMarkdownProjection,
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type {
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
} from "@/domain/resume/schema";

function text(
  id: string,
  value: string,
  style?: Extract<ResumeBlock, { type: "text" }>["style"],
): ResumeBlock {
  return {
    id,
    type: "text",
    content: createRichTextFromPlainText(value),
    ...(style ? { style } : {}),
  };
}

function section(
  id: string,
  title: string,
  blocks: ResumeBlock[],
  overrides: Partial<ResumeSection> = {},
): ResumeSection {
  return {
    id,
    title: createRichTextFromPlainText(title),
    semantic: "experience",
    visible: true,
    blocks,
    ...overrides,
  };
}

function documentWithSections(sections: ResumeSection[]): ResumeDocument {
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
    sections,
  };
}

function apply(baseDocument: ResumeDocument, parsedDocument: ResumeDocument) {
  const baseDocumentVersion = 7;
  const projection = serializeResumeMarkdown(baseDocument, {
    baseDocumentVersion,
  }).projection;
  const sourceMap = serializeResumeMarkdown(parsedDocument, {
    baseDocumentVersion,
  }).sourceMap;
  return applyResumeMarkdownProjection({
    baseDocument,
    parsedDocument,
    sourceMap,
    projection,
    baseDocumentVersion,
  });
}

describe("applyResumeMarkdownProjection", () => {
  it("retains text identity and presentation when its content is edited", () => {
    const base = documentWithSections([
      section(
        "section-original",
        "经历",
        [text("alpha", "Alpha", { color: "#111827", align: "right" })],
        {
          titleStyle: { color: "#1677ff", fontSize: 28 },
          layout: { gap: 12 },
          pagination: { keepTogether: true },
        },
      ),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "经历（更新）", [
        text("generated-alpha", "Alpha edited"),
      ]),
    ]);

    const result = apply(base, parsed);

    expect(result.diagnostics).toEqual([]);
    expect(result.document.sections[0]).toMatchObject({
      id: "section-original",
      titleStyle: { color: "#1677ff", fontSize: 28 },
      layout: { gap: 12 },
      pagination: { keepTogether: true },
      blocks: [
        {
          id: "alpha",
          type: "text",
          style: { color: "#111827", align: "right" },
        },
      ],
    });
  });

  it("refuses an ambiguous simultaneous reorder, insertion and deletion instead of rebuilding", () => {
    const base = documentWithSections([
      section("section-original", "经历", [
        text("alpha", "Alpha", { color: "#111827" }),
        text("beta", "Beta", { tone: "muted" }),
        text("removed", "Remove me", { align: "center" }),
      ]),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "经历", [
        text("generated-beta", "Beta"),
        text("inserted", "Inserted"),
        text("generated-alpha", "Alpha"),
      ]),
    ]);

    const result = apply(base, parsed);
    expect(result.document).toEqual(base);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "projection_degraded",
      }),
    ]);
  });

  it("matches duplicate siblings by occurrence without crossing section boundaries", () => {
    const base = documentWithSections([
      section("section-one", "第一部分", [
        text("duplicate-one", "Same", { tone: "muted" }),
        text("duplicate-two", "Same", { align: "right" }),
      ]),
      section("section-two", "第二部分", [
        text("other-section", "Same", { color: "#1677ff" }),
      ]),
    ]);
    const parsed = documentWithSections([
      section("generated-one", "第一部分", [
        text("generated-1", "Same"),
        text("generated-2", "Same edited"),
      ]),
      section("generated-two", "第二部分", [
        text("generated-3", "Same edited too"),
      ]),
    ]);

    const result = apply(base, parsed);

    expect(result.document.sections[0]?.blocks).toMatchObject([
      { id: "duplicate-one", style: { tone: "muted" } },
      { id: "duplicate-two", style: { align: "right" } },
    ]);
    expect(result.document.sections[1]?.blocks).toMatchObject([
      { id: "other-section", style: { color: "#1677ff" } },
    ]);
  });

  it("keeps the intended duplicate identity when the first duplicate is edited", () => {
    const base = documentWithSections([
      section("section-original", "经历", [
        text("duplicate-one", "Same", { tone: "muted" }),
        text("duplicate-two", "Same", { align: "right" }),
      ]),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "经历", [
        text("generated-1", "Same edited"),
        text("generated-2", "Same"),
      ]),
    ]);

    const result = apply(base, parsed);

    expect(result.document.sections[0]?.blocks).toMatchObject([
      { id: "duplicate-one", style: { tone: "muted" } },
      { id: "duplicate-two", style: { align: "right" } },
    ]);
  });

  it("restores flattened groups, list presentation, and projected badges", () => {
    const base = documentWithSections([
      section("section-original", "技能", [
        {
          id: "group-base",
          type: "group",
          direction: "vertical",
          gap: 10,
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
                  children: [text("item-text", "TypeScript")],
                },
              ],
            },
            {
              id: "badges-base",
              type: "badges",
              wrap: false,
              gap: 4,
              items: [{ id: "badge-base", text: "Bun" }],
            },
          ],
        },
      ]),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "技能", [
        {
          id: "list-generated",
          type: "list",
          marker: "disc",
          items: [
            {
              id: "item-generated",
              children: [text("item-text-generated", "TypeScript 5")],
            },
          ],
        },
        {
          id: "badges-as-list",
          type: "list",
          marker: "disc",
          items: [
            {
              id: "badge-item-generated",
              children: [text("badge-text-generated", "Bun")],
            },
          ],
        },
      ]),
    ]);

    const result = apply(base, parsed);

    expect(result.document.sections[0]?.blocks).toMatchObject([
      {
        id: "group-base",
        type: "group",
        direction: "vertical",
        gap: 10,
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
          {
            id: "badges-base",
            type: "badges",
            wrap: false,
            gap: 4,
            items: [{ id: "badge-base", text: "Bun" }],
          },
        ],
      },
    ]);
  });

  it("preserves row presentation and existing columns around an inserted column", () => {
    const column = (
      id: string,
      headingId: string,
      heading: string,
    ): ResumeBlock => ({
      id,
      type: "group",
      direction: "vertical",
      gap: 8,
      children: [text(headingId, heading, { fontSize: 17, fontWeight: 700 })],
    });
    const base = documentWithSections([
      section("section-original", "项目", [
        {
          id: "row-base",
          type: "row",
          gap: 20,
          align: "center",
          justify: "between",
          children: [
            column("column-a", "heading-a", "A"),
            column("column-b", "heading-b", "B"),
          ],
        },
      ]),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "项目", [
        {
          id: "row-generated",
          type: "row",
          children: [
            column("generated-a", "generated-heading-a", "A"),
            column("inserted-column", "inserted-heading", "X"),
            column("generated-b", "generated-heading-b", "B"),
          ],
        },
      ]),
    ]);

    const result = apply(base, parsed);

    expect(result.document.sections[0]?.blocks[0]).toMatchObject({
      id: "row-base",
      type: "row",
      gap: 20,
      align: "center",
      justify: "between",
      children: [
        { id: "column-a", children: [{ id: "heading-a" }] },
        { id: "inserted-column", children: [{ id: "inserted-heading" }] },
        { id: "column-b", children: [{ id: "heading-b" }] },
      ],
    });
  });

  it("rejects stale projection metadata instead of applying its identities", () => {
    const base = documentWithSections([
      section("section-original", "经历", [
        text("alpha", "Alpha", { color: "#111827" }),
      ]),
    ]);
    const parsed = documentWithSections([
      section("section-generated", "经历", [
        text("generated-alpha", "Alpha edited"),
      ]),
    ]);
    const projection = serializeResumeMarkdown(base, {
      baseDocumentVersion: 6,
    }).projection;
    const sourceMap = serializeResumeMarkdown(parsed).sourceMap;

    const result = applyResumeMarkdownProjection({
      baseDocument: base,
      parsedDocument: parsed,
      sourceMap,
      projection,
      baseDocumentVersion: 7,
    });

    expect(result.document).toEqual(base);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "projection_invalid",
      }),
    ]);
  });

  it("applies the active projection during parsing and restores untouched inline presentation", () => {
    const taggedContent = createRichTextFromPlainText("Platform tag");
    const firstNode = taggedContent.content[0]?.content[0];
    if (firstNode?.type === "text") {
      firstNode.marks = [
        { type: "tag" },
        { type: "underline" },
        { type: "textColor", attrs: { color: "#1677ff" } },
      ];
    }
    const base = documentWithSections([
      section("section-original", "经历", [
        {
          id: "tagged-text",
          type: "text",
          content: taggedContent,
          style: { align: "center" },
        },
        text("edited-text", "Before", { tone: "muted" }),
      ]),
    ]);
    const serialized = serializeResumeMarkdown(base, {
      baseDocumentVersion: 7,
    });
    const source = serialized.source.replace("Before", "After");

    const result = parseResumeMarkdown({
      source,
      baseDocument: base,
      baseDocumentVersion: 7,
      locale: "zh-CN",
      projection: serialized.projection,
    });

    expect(result.hasErrors).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.sections[0]?.blocks).toMatchObject([
      {
        id: "tagged-text",
        style: { align: "center" },
        content: {
          content: [
            {
              content: [
                {
                  type: "text",
                  text: "Platform tag",
                  marks: [
                    { type: "tag" },
                    { type: "underline" },
                    {
                      type: "textColor",
                      attrs: { color: "#1677ff" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        id: "edited-text",
        style: { tone: "muted" },
      },
    ]);
  });

  it("keeps whole-node projected marks through text edits and source reverts", () => {
    const taggedContent = createRichTextFromPlainText("Platform tag");
    const firstNode = taggedContent.content[0]?.content[0];
    if (firstNode?.type === "text") {
      firstNode.marks = [
        { type: "tag" },
        { type: "underline" },
        { type: "textColor", attrs: { color: "#1677ff" } },
      ];
    }
    const base = documentWithSections([
      section("section-original", "经历", [
        {
          id: "tagged-text",
          type: "text",
          content: taggedContent,
        },
      ]),
    ]);
    const serialized = serializeResumeMarkdown(base, {
      baseDocumentVersion: 7,
    });
    const edited = parseResumeMarkdown({
      source: serialized.source.replace("Platform tag", "Edited platform tag"),
      baseDocument: base,
      baseDocumentVersion: 7,
      locale: "zh-CN",
      projection: serialized.projection,
    });

    expect(edited.diagnostics).toEqual([]);
    expect(edited.document?.sections[0]?.blocks[0]).toMatchObject({
      id: "tagged-text",
      content: {
        content: [
          {
            content: [
              {
                type: "text",
                text: "Edited platform tag",
                marks: [
                  { type: "tag" },
                  { type: "underline" },
                  { type: "textColor", attrs: { color: "#1677ff" } },
                ],
              },
            ],
          },
        ],
      },
    });

    const reverted = parseResumeMarkdown({
      source: serialized.source,
      baseDocument: base,
      baseDocumentVersion: 7,
      locale: "zh-CN",
      projection: edited.projection,
    });

    expect(reverted.diagnostics).toEqual([]);
    expect(reverted.document).toEqual(base);
  });
});
