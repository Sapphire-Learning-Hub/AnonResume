import {
  MAX_RESUME_MARKDOWN_BYTES,
  parseResumeMarkdownFrontMatter,
  serializeResumeMarkdownFrontMatter,
} from "@/domain/resume/markdown";

describe("AnonResume Markdown front matter", () => {
  const validSource = [
    "---",
    "anonresume: 1",
    'title: "后端工程师简历"',
    "locale: zh-CN",
    "page-margin: 18 16 20 14",
    'font-family: "Noto Sans SC"',
    "font-size: 10.5",
    "line-height: 1.55",
    'accent: "#1677ff"',
    'text-color: "#111827"',
    'muted-color: "#64748b"',
    "---",
    "",
    "## 经历",
  ].join("\n");

  it("parses the exact v1 scalar whitelist with source positions", () => {
    const result = parseResumeMarkdownFrontMatter(validSource);

    expect(result.frontMatter).toEqual({
      version: 1,
      title: "后端工程师简历",
      locale: "zh-CN",
      pageMargin: { top: 18, right: 16, bottom: 20, left: 14 },
      fontFamily: "Noto Sans SC",
      fontSize: 10.5,
      lineHeight: 1.55,
      accent: "#1677ff",
      textColor: "#111827",
      mutedColor: "#64748b",
    });
    expect(result.body).toBe("\n## 经历");
    expect(result.bodyStartLine).toBe(13);
    expect(result.diagnostics).toEqual([]);
  });

  it("serializes fields in one deterministic order and quotes strings", () => {
    const parsed = parseResumeMarkdownFrontMatter(validSource);

    expect(parsed.frontMatter).toBeDefined();
    expect(serializeResumeMarkdownFrontMatter(parsed.frontMatter!)).toBe(
      validSource.split("\n").slice(0, 12).join("\n"),
    );
  });

  it.each([
    {
      name: "a missing syntax version",
      source: "---\ntitle: Resume\n---\n",
      code: "frontmatter_version_required",
    },
    {
      name: "an unknown key",
      source: "---\nanonresume: 1\ncustom-css: nope\n---\n",
      code: "frontmatter_unknown_key",
      severity: "warning",
    },
    {
      name: "a duplicate key",
      source: "---\nanonresume: 1\ntitle: One\ntitle: Two\n---\n",
      code: "frontmatter_duplicate_key",
    },
    {
      name: "a missing closing delimiter",
      source: "---\nanonresume: 1\ntitle: Resume\n",
      code: "frontmatter_unclosed",
    },
    {
      name: "an executable YAML tag",
      source:
        "---\nanonresume: 1\ntitle: !!js/function >\n  function () {}\n---\n",
      code: "frontmatter_invalid_scalar",
    },
  ])("reports $name without throwing", ({ source, code, severity }) => {
    const result = parseResumeMarkdownFrontMatter(source);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code,
          severity: severity ?? "error",
          line: expect.any(Number),
          column: expect.any(Number),
          parameters: expect.any(Object),
        }),
      ]),
    );
  });

  it("rejects malformed values with field-specific diagnostics", () => {
    const source = [
      "---",
      "anonresume: 2",
      "page-margin: 1 2 3",
      "font-size: many",
      "line-height: -1",
      'accent: "red"',
      "---",
    ].join("\n");
    const result = parseResumeMarkdownFrontMatter(source);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "frontmatter_unsupported_version",
      "frontmatter_invalid_page_margin",
      "frontmatter_invalid_number",
      "frontmatter_invalid_number",
      "frontmatter_invalid_color",
    ]);
  });

  it("rejects source larger than the existing 512 KiB boundary", () => {
    const result = parseResumeMarkdownFrontMatter(
      `---\nanonresume: 1\n---\n${"x".repeat(MAX_RESUME_MARKDOWN_BYTES)}`,
    );

    expect(result.frontMatter).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ severity: "error", code: "source_too_large" }),
    ]);
  });
});
