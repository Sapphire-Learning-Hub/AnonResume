import {
  formatResumeMarkdown,
  normalizeResumeMarkdownSource,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

describe("normalizeResumeMarkdownSource", () => {
  it("preserves comments and Markdown spelling while collapsing redundant blank lines", () => {
    const source = [
      "<!-- local editing note",
      "",
      "",
      "kept verbatim -->",
      "## 经历",
      "",
      "",
      "",
      "_第一段_",
      "",
      "* 条目一",
      "* 条目二",
    ].join("\n");

    expect(normalizeResumeMarkdownSource(source)).toBe(
      [
        "<!-- local editing note",
        "",
        "",
        "kept verbatim -->",
        "## 经历",
        "",
        "_第一段_",
        "",
        "* 条目一",
        "* 条目二",
        "",
      ].join("\n"),
    );
  });

  it("normalizes line endings without rewriting fenced code or directive-looking code", () => {
    const source = [
      "---",
      "anonresume: 1",
      'title: "格式测试"',
      "---",
      "",
      "## 项目",
      "",
      "```md",
      "",
      ":::row",
      "",
      ":::",
      "```",
      "",
      "",
      "",
      "结尾",
    ].join("\r\n");

    const normalized = normalizeResumeMarkdownSource(source);

    expect(normalized).toContain(
      ["```md", "", ":::row", "", ":::", "```"].join("\n"),
    );
    expect(normalized).toContain("```\n\n结尾\n");
    expect(normalized).not.toContain("\r");
  });
});

describe("formatResumeMarkdown", () => {
  it("returns minimally normalized source instead of canonical reserialization", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    baseDocument.sections = [];
    const source = [
      "<!-- keep this note -->",
      "## 经历",
      "",
      "_自定义强调写法_",
      "",
      "* 条目一",
      "* 条目二",
      "",
      "",
    ].join("\n");

    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN");

    expect(formatted.result.hasErrors).toBe(false);
    expect(formatted.source).toBe(
      [
        "<!-- keep this note -->",
        "## 经历",
        "",
        "_自定义强调写法_",
        "",
        "* 条目一",
        "* 条目二",
        "",
      ].join("\n"),
    );
    expect(formatted.changed).toBe(true);
    expect(formatted.semanticChanged).toBe(true);
  });

  it("treats source-only normalization as a semantic no-op", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    const serialized = serializeResumeMarkdown(baseDocument, {
      baseDocumentVersion: 3,
    });
    const source = serialized.source.replaceAll("\n", "\r\n") + "\r\n\r\n";
    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN", {
      baseDocumentVersion: 3,
      projection: serialized.projection,
    });

    expect(formatted.result.hasErrors).toBe(false);
    expect(formatted.source).toBe(serialized.source);
    expect(formatted.changed).toBe(true);
    expect(formatted.semanticChanged).toBe(false);
    expect(formatted.projection).toEqual(formatted.result.projection);
  });

  it("keeps blocking input available for correction without canonicalizing it", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    const source = "---\r\nanonresume: 1\r\n---\r\n\r\n:::group\r\nbroken";
    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN");

    expect(formatted.result.hasErrors).toBe(true);
    expect(formatted.source).toBe(
      "---\nanonresume: 1\n---\n\n:::group\nbroken\n",
    );
    expect(formatted.changed).toBe(true);
    expect(formatted.semanticChanged).toBe(false);
  });
});
