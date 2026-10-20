import { importResumeMarkdown } from "@/domain/resume/import/markdown";
import { serializeResumeMarkdown } from "@/domain/resume/markdown";
import { visitResumeBlocks } from "@/domain/resume/block-tree";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";

describe("platform Markdown import", () => {
  it.each(["auto", "standard", "mujicv"] as const)(
    "honors the source version rather than flattening it in %s mode",
    (dialect) => {
      const document = createResumeDocumentFromTemplate("modular", "zh-CN");
      const { source } = serializeResumeMarkdown(document);
      const result = importResumeMarkdown({
        markdown: source,
        dialect,
        locale: "zh-CN",
      });
      expect(result.report.diagnostics).toEqual([]);
      expect(result.report.detectedDialect).toBe("anonresume");
      expect(result.document.meta.title).toBe(document.meta.title);
      expect(result.document.settings).toEqual(document.settings);
      expect(result.document.sections).toHaveLength(5);
      const columns = result.document.sections.filter(
        (section) => section.layout?.columns === 2,
      );
      expect(columns).toHaveLength(4);
      expect(columns.map((section) => section.blocks.length)).toEqual([
        2, 2, 2, 2,
      ]);
      expect(columns[0]!.blocks[1]).toMatchObject({
        type: "badges",
        items: [
          { text: "活动策划" },
          { text: "用户沟通" },
          { text: "数据整理" },
          { text: "项目协作" },
        ],
      });
      expect(
        columns[1]!.blocks.map((block) =>
          block.type === "group" ? block.children.length : 0,
        ),
      ).toEqual([3, 3]);
      expect(columns[3]!.blocks[1]).toMatchObject({
        type: "text",
        content: { content: [{ type: "paragraph" }, { type: "paragraph" }] },
      });
      let rows = 0;
      for (const section of result.document.sections)
        visitResumeBlocks(section.blocks, (block) => {
          if (block.type === "row") rows++;
        });
      expect(rows).toBe(1);
      expect(result.document.meta.import).toMatchObject({
        format: "markdown",
        dialect: "anonresume",
        originalSource: source,
      });
    },
  );

  it("retains version-one code semantics", () => {
    const result = importResumeMarkdown({
      markdown:
        "---\nanonresume: 1\ntitle: Legacy\n---\n## Skills\n\n`TypeScript`",
      dialect: "auto",
      locale: "en-US",
    });
    expect(result.report.diagnostics).toEqual([]);
    expect(result.document.meta.title).toBe("Legacy");
    expect(result.document.sections[0]!.blocks[0]).toMatchObject({
      type: "text",
      content: {
        content: [
          { content: [{ text: "TypeScript", marks: [{ type: "code" }] }] },
        ],
      },
    });
  });

  it.each([
    [
      "---\nanonresume: 999\n---\n## Skills\n\n`React`",
      "frontmatter_unsupported_version",
    ],
    [
      "---\nanonresume: 2\n---\n## Skills\n\n:::layout {columns=2}\nText",
      "block_unclosed_directive",
    ],
    ["---\nanonresume: 2\n## Skills\n\nText", "frontmatter_unclosed"],
  ])(
    "blocks invalid platform source instead of silently importing it: %s",
    (markdown, code) => {
      const result = importResumeMarkdown({
        markdown,
        dialect: "auto",
        locale: "zh-CN",
      });
      expect(result.report.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code,
          message: expect.any(String),
          line: expect.any(Number),
        }),
      );
    },
  );
});
