import {
  formatResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

describe("formatResumeMarkdown", () => {
  it("normalizes attribute order, spacing, comments, and redundant blank lines", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    const source = [
      "---",
      "anonresume: 1",
      'title: "格式测试"',
      "locale: zh-CN",
      "page-margin: 32 32 32 32",
      'font-family: "IBM Plex Sans"',
      "font-size: 14",
      "line-height: 1.45",
      'accent: "#0f62fe"',
      'text-color: "#0f172a"',
      'muted-color: "#475569"',
      "---",
      "",
      '<!-- local editing note -->',
      '## 经历 {visible=true semantic="experience"}',
      "",
      "",
      "第一段",
      "",
      "",
      "",
      "第二段",
      "",
      "- 条目一",
      "- 条目二",
    ].join("\n");

    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN");

    expect(formatted.result.hasErrors).toBe(false);
    expect(formatted.source).not.toContain("<!--");
    expect(formatted.source).toContain(
      '## 经历 {semantic="experience" visible=true direction="vertical"',
    );
    expect(formatted.source).toContain("第一段\n\n第二段\n\n- 条目一\n- 条目二");
    expect(formatted.changed).toBe(true);
    expect(formatted.semanticChanged).toBe(true);
  });

  it("detects a canonical semantic no-op", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    const source = serializeResumeMarkdown(baseDocument).source;
    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN");

    expect(formatted.result.hasErrors).toBe(false);
    expect(formatted.source).toBe(source);
    expect(formatted.changed).toBe(false);
    expect(formatted.semanticChanged).toBe(false);
  });

  it("leaves blocking input intact for correction", () => {
    const baseDocument = createDefaultResumeDocument("zh-CN");
    const source = "---\nanonresume: 1\n---\n\n:::group\nnot closed";
    const formatted = formatResumeMarkdown(source, baseDocument, "zh-CN");

    expect(formatted.result.hasErrors).toBe(true);
    expect(formatted.source).toBe(source);
    expect(formatted.changed).toBe(false);
  });
});
