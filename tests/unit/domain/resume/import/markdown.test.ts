import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { importResumeMarkdown } from "@/domain/resume/import/markdown";

describe("importResumeMarkdown standard Markdown", () => {
  it("maps headings, rich text, links, breaks, and nested lists", () => {
    const result = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: [
        "# Jane Doe",
        "",
        "**Frontend engineer** with *product sense* and ~~legacy~~ `TypeScript`.",
        "",
        "[Portfolio](mailto:jane@example.com)  ",
        "Second line",
        "",
        "## Experience",
        "",
        "### `Lead` Example Corp",
        "",
        "- Parent achievement",
        "  - Nested result",
      ].join("\n"),
    });

    expect(result.report.detectedDialect).toBe("standard");
    expect(result.report.diagnostics).toEqual([]);
    expect(result.document.meta.title).toBe("Jane Doe");
    expect(result.document.sections.map((section) =>
      section.title ? getPlainTextFromRichText(section.title) : undefined,
    )).toEqual(["Jane Doe", "Experience"]);
    expect(result.document.sections[0]).toMatchObject({
      semantic: "profile",
      titleStyle: { fontSize: 28 },
    });

    const profileBlocks = result.document.sections[0]?.blocks ?? [];
    const summary = profileBlocks[0];

    expect(profileBlocks).toHaveLength(2);
    expect(summary?.type).toBe("text");

    if (summary?.type !== "text") {
      throw new Error("Expected an imported summary text block");
    }

    expect(summary.content.content[0]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ marks: [{ type: "bold" }] }),
        expect.objectContaining({ marks: [{ type: "italic" }] }),
        expect.objectContaining({ marks: [{ type: "strike" }] }),
        expect.objectContaining({ marks: [{ type: "tag" }] }),
      ]),
    );

    const linkBlock = profileBlocks[1];

    expect(linkBlock?.type).toBe("text");

    if (linkBlock?.type !== "text") {
      throw new Error("Expected an imported link text block");
    }

    expect(linkBlock.content.content[0]?.content).toEqual([
      {
        type: "text",
        text: "Portfolio",
        marks: [{ type: "link", attrs: { href: "mailto:jane@example.com" } }],
      },
      { type: "hardBreak" },
      { type: "text", text: "Second line" },
    ]);

    const experienceBlocks = result.document.sections[1]?.blocks ?? [];
    const heading = experienceBlocks[0];
    const list = experienceBlocks[1];

    expect(heading).toMatchObject({
      type: "text",
      style: { fontSize: 17, fontWeight: 700 },
    });
    expect(list?.type).toBe("list");

    if (list?.type !== "list") {
      throw new Error("Expected an imported list block");
    }

    expect(list.items[0]?.children[1]).toMatchObject({
      type: "list",
      items: [
        {
          children: [
            expect.objectContaining({ type: "text" }),
          ],
        },
      ],
    });
  });

  it("reports empty and oversized sources as blocking errors", () => {
    const empty = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: "   ",
    });
    const oversized = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: `# Name\n${"x".repeat(512 * 1024)}`,
    });

    expect(empty.report.diagnostics).toEqual([
      expect.objectContaining({ severity: "error", code: "source_empty" }),
    ]);
    expect(oversized.report.diagnostics).toEqual([
      expect.objectContaining({ severity: "error", code: "source_too_large" }),
    ]);
  });

  it("preserves raw HTML as text and reports a warning", () => {
    const result = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: "# Name\n\n<script>alert('x')</script>",
    });
    const block = result.document.sections[0]?.blocks[0];

    expect(block?.type).toBe("text");

    if (block?.type !== "text") {
      throw new Error("Expected raw HTML fallback text");
    }

    expect(getPlainTextFromRichText(block.content)).toContain("<script>");
    expect(result.report.diagnostics).toEqual([
      expect.objectContaining({ code: "raw_html_preserved_as_text", line: 3 }),
    ]);
  });

  it("preserves ordered-list semantics without suppressing its marker", () => {
    const result = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: "# Name\n\n## Steps\n\n1. First\n2. Second",
    });
    const list = result.document.sections[1]?.blocks[0];

    expect(list).toMatchObject({
      type: "list",
      ordered: true,
      items: [expect.any(Object), expect.any(Object)],
    });
    expect(list).not.toHaveProperty("marker");
  });
});
