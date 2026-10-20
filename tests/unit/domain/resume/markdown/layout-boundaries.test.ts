import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  formatResumeMarkdown,
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";

describe("Markdown structural boundaries", () => {
  it.each([
    "a*b_[c]",
    "a`b``c",
    "``",
    " code ",
    " ",
    "line\nbreak",
    "[link](url)",
  ])("preserves literal badge labels, including %j", (label) => {
    const document = createDefaultResumeDocument("en-US");
    document.sections = [
      {
        id: "s",
        visible: true,
        blocks: [
          {
            id: "badges",
            type: "badges",
            wrap: false,
            gap: 3,
            items: [{ id: "tag", text: label }],
          },
          {
            id: "row",
            type: "row",
            children: [
              {
                id: "left",
                type: "text",
                content: createRichTextFromPlainText("Left"),
              },
              {
                id: "right",
                type: "text",
                content: createRichTextFromPlainText("Right"),
              },
            ],
          },
        ],
      },
    ];
    const serialized = serializeResumeMarkdown(document);
    const formatted = formatResumeMarkdown(
      serialized.source,
      document,
      "en-US",
      { projection: serialized.projection },
    );
    expect(formatted.result.diagnostics).toEqual([]);
    expect(formatted.result.document).toEqual(document);
    const portable = parseResumeMarkdown({
      source: serialized.source,
      baseDocument: { ...document, sections: [] },
      locale: "en-US",
    });
    expect(portable.diagnostics).toEqual([]);
    expect(portable.document!.sections[0]!.blocks).toMatchObject([
      { type: "badges", items: [{ text: label }] },
      { type: "row", children: [{ type: "text" }, { type: "text" }] },
    ]);
  });
  it("exports the modular template's parallel cells without relying on a private mapping", () => {
    const document = createResumeDocumentFromTemplate("modular", "zh-CN");
    const { source } = serializeResumeMarkdown(document);
    const parsed = parseResumeMarkdown({
      source,
      baseDocument: { ...document, sections: [] },
      locale: "zh-CN",
    });
    expect(parsed.diagnostics).toEqual([]);
    expect(source.match(/^:::layout/gm)).toHaveLength(4);
    expect(source).not.toMatch(/:::text|:::badges|:tag\[/);
    const parallel = parsed.document!.sections.filter(
      (section) => section.layout?.columns === 2,
    );
    expect(parallel).toHaveLength(4);
    expect(parallel.map((section) => section.blocks.length)).toEqual([
      2, 2, 2, 2,
    ]);
    expect(parallel[0]!.blocks[1]).toMatchObject({
      type: "badges",
      items: [
        { text: "活动策划" },
        { text: "用户沟通" },
        { text: "数据整理" },
        { text: "项目协作" },
      ],
    });
    expect(
      parallel[1]!.blocks.map((block) =>
        block.type === "group" ? block.children.length : 0,
      ),
    ).toEqual([3, 3]);
    expect(parallel[3]!.blocks[1]).toMatchObject({
      type: "text",
      content: { content: [{ type: "paragraph" }, { type: "paragraph" }] },
    });
  });

  it("keeps ordinary multi-paragraph text and its design intact after editing", () => {
    const document = createDefaultResumeDocument("en-US");
    document.sections = [
      {
        id: "s",
        visible: true,
        blocks: [
          {
            id: "intro",
            type: "text",
            style: { color: "#123456", fontSize: 13 },
            content: {
              type: "doc",
              content: [
                ...createRichTextFromPlainText("First paragraph").content,
                ...createRichTextFromPlainText("Second paragraph").content,
              ],
            },
          },
          {
            id: "other",
            type: "text",
            content: createRichTextFromPlainText("Neighbor"),
          },
        ],
      },
    ];
    const serialized = serializeResumeMarkdown(document);
    expect(serialized.source).not.toContain(":::text");
    const result = formatResumeMarkdown(
      serialized.source.replace("Second paragraph", "Second edited paragraph"),
      document,
      "en-US",
      { projection: serialized.projection },
    );
    const expected = structuredClone(document);
    const text = expected.sections[0]!.blocks[0];
    if (text?.type !== "text") throw new Error("invalid fixture");
    text.content.content[1] = createRichTextFromPlainText(
      "Second edited paragraph",
    ).content[0]!;
    expect(result.result.diagnostics).toEqual([]);
    expect(result.result.document).toEqual(expected);
  });

  it("uses backtick-only paragraphs for badges without changing mixed inline code", () => {
    const document = createDefaultResumeDocument("en-US");
    const result = parseResumeMarkdown({
      source:
        "## Skills\n\n`TypeScript` `React`\n\nUse `code` here\n\n`Single`",
      baseDocument: { ...document, sections: [] },
      locale: "en-US",
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.document!.sections[0]!.blocks).toMatchObject([
      { type: "badges", items: [{ text: "TypeScript" }, { text: "React" }] },
      {
        type: "text",
        content: {
          content: [
            {
              content: [
                { text: "Use " },
                { text: "code", marks: [{ type: "code" }] },
                { text: " here" },
              ],
            },
          ],
        },
      },
      { type: "badges", items: [{ text: "Single" }] },
    ]);
  });

  it("does not reinterpret standalone code in a published version-one source", () => {
    const result = parseResumeMarkdown({
      source: "---\nanonresume: 1\n---\n## Code\n\n`TypeScript`",
      baseDocument: { ...createDefaultResumeDocument("en-US"), sections: [] },
      locale: "en-US",
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.document!.sections[0]!.blocks[0]).toMatchObject({
      type: "text",
    });
  });

  it("retains only the column boundary around nested vertical groups", () => {
    const document = createDefaultResumeDocument("en-US");
    document.sections = [
      {
        id: "s",
        visible: true,
        blocks: [
          {
            id: "row",
            type: "row",
            children: [
              {
                id: "column",
                type: "group",
                direction: "vertical",
                children: [
                  {
                    id: "nested",
                    type: "group",
                    direction: "vertical",
                    gap: 7,
                    children: [
                      {
                        id: "a",
                        type: "text",
                        content: createRichTextFromPlainText("First"),
                      },
                      {
                        id: "b",
                        type: "text",
                        content: createRichTextFromPlainText("Second"),
                      },
                    ],
                  },
                  {
                    id: "c",
                    type: "text",
                    content: createRichTextFromPlainText("Third"),
                  },
                ],
              },
              {
                id: "right",
                type: "text",
                content: createRichTextFromPlainText("Right"),
              },
            ],
          },
        ],
      },
    ];
    const serialized = serializeResumeMarkdown(document);
    expect(serialized.source.match(/^:::group/gm)).toHaveLength(1);
    const result = formatResumeMarkdown(
      serialized.source.replace("Second", "Second edited"),
      document,
      "en-US",
      { projection: serialized.projection },
    );
    const expected = structuredClone(document);
    const row = expected.sections[0]!.blocks[0];
    if (
      row?.type !== "row" ||
      row.children[0]?.type !== "group" ||
      row.children[0].children[0]?.type !== "group" ||
      row.children[0].children[0].children[1]?.type !== "text"
    )
      throw new Error("invalid fixture");
    row.children[0].children[0].children[1].content =
      createRichTextFromPlainText("Second edited");
    expect(result.result.diagnostics).toEqual([]);
    expect(result.result.document).toEqual(expected);
  });

  it("does not turn a genuine text paragraph containing only code spans into badges", () => {
    const document = createDefaultResumeDocument("en-US");
    document.sections = [
      {
        id: "s",
        visible: true,
        blocks: [
          {
            id: "code",
            type: "text",
            content: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "first", marks: [{ type: "code" }] },
                    { type: "text", text: " " },
                    { type: "text", text: "second", marks: [{ type: "code" }] },
                  ],
                },
              ],
            },
          },
        ],
      },
    ];
    const serialized = serializeResumeMarkdown(document);
    const result = formatResumeMarkdown(serialized.source, document, "en-US", {
      projection: serialized.projection,
    });
    expect(result.result.diagnostics).toEqual([]);
    expect(result.result.document).toEqual(document);
    expect(
      parseResumeMarkdown({
        source: serialized.source,
        baseDocument: { ...document, sections: [] },
        locale: "en-US",
      }).document!.sections[0]!.blocks[0]?.type,
    ).toBe("text");
  });

  it.each([
    "## S\n\n:::row\n:::layout {columns=2}\nText\n:::\n:::",
    "## S\n\n:::layout {columns=2}\n## Other\nText\n:::",
    "## S\n\n:::layout {columns=2}\nText\n:::\n\nOutside",
    "## S\n\nText\n:::\n\nDiscarded",
  ])("rejects malformed boundaries instead of losing content: %s", (source) => {
    const result = parseResumeMarkdown({
      source,
      baseDocument: { ...createDefaultResumeDocument("en-US"), sections: [] },
      locale: "en-US",
    });
    expect(result.hasErrors).toBe(true);
    expect(result.document).toBeUndefined();
  });
});
