import {
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type { ResumeDocument } from "@/domain/resume/schema";

function createDocument(): ResumeDocument {
  return {
    schemaVersion: 1,
    meta: { title: "后端工程师", locale: "zh-CN" },
    settings: {
      page: {
        size: "A4",
        margin: { top: 18, right: 16, bottom: 20, left: 14 },
      },
      typography: {
        fontFamily: '"Source Han Sans SC", "Noto Sans SC", sans-serif',
        baseFontSize: 10.5,
        lineHeight: 1.55,
      },
      theme: {
        accent: "#1677ff",
        textColor: "#111827",
        mutedColor: "#64748b",
      },
    },
    sections: [
      {
        id: "section-profile",
        title: createRichTextFromPlainText("个人简介"),
        semantic: "profile",
        visible: false,
        blocks: [
          {
            id: "profile-one",
            type: "text",
            content: createRichTextFromPlainText("第一段"),
          },
          {
            id: "profile-two",
            type: "text",
            content: createRichTextFromPlainText("第二段"),
          },
        ],
      },
      {
        id: "section-experience",
        title: createRichTextFromPlainText("工作经历"),
        semantic: "experience",
        visible: true,
        blocks: [
          {
            id: "role-heading",
            type: "text",
            content: createRichTextFromPlainText("高级工程师"),
            style: { fontSize: 17, fontWeight: 700 },
          },
          {
            id: "ordered-list",
            type: "list",
            ordered: true,
            items: [
              {
                id: "item-1",
                children: [
                  {
                    id: "item-1-text",
                    type: "text",
                    content: createRichTextFromPlainText("交付核心功能"),
                  },
                ],
              },
              {
                id: "item-2",
                children: [
                  {
                    id: "item-2-text",
                    type: "text",
                    content: createRichTextFromPlainText("完善工程质量"),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("AnonResume Markdown basic codec", () => {
  it("serializes settings, sections, paragraphs, headings, and lists deterministically", () => {
    const first = serializeResumeMarkdown(createDocument());
    const second = serializeResumeMarkdown(createDocument());

    expect(first.diagnostics).toEqual([]);
    expect(second.source).toBe(first.source);
    expect(first.source).toContain('title: "后端工程师"');
    expect(first.source).toContain(
      '## 个人简介 {semantic="profile" visible=false}',
    );
    expect(first.source).toContain("第一段\n\n第二段");
    expect(first.source).toContain(
      '## 工作经历 {semantic="experience" visible=true}',
    );
    expect(first.source).toContain("### 高级工程师");
    expect(first.source).toContain("1. 交付核心功能\n2. 完善工程质量");
  });

  it("parses the canonical source into a validated candidate document", () => {
    const baseDocument = createDocument();
    const serialized = serializeResumeMarkdown(baseDocument);
    const result = parseResumeMarkdown({
      source: serialized.source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(result.hasErrors).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      schemaVersion: 1,
      meta: { title: "后端工程师", locale: "zh-CN" },
      settings: baseDocument.settings,
      sections: [
        {
          title: createRichTextFromPlainText("个人简介"),
          semantic: "profile",
          visible: false,
          blocks: [
            { type: "text", content: createRichTextFromPlainText("第一段") },
            { type: "text", content: createRichTextFromPlainText("第二段") },
          ],
        },
        {
          title: createRichTextFromPlainText("工作经历"),
          semantic: "experience",
          visible: true,
          blocks: [
            {
              type: "text",
              content: createRichTextFromPlainText("高级工程师"),
              style: { fontSize: 17, fontWeight: 700 },
            },
            { type: "list", ordered: true },
          ],
        },
      ],
    });
    expect(result.sourceMap.sections).toHaveLength(2);
  });

  it("preserves meaningful paragraph separation while normalizing extra blank lines", () => {
    const baseDocument = createDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      "第一段\n\n第二段",
      "第一段\n\n\n\n第二段",
    );
    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks).toHaveLength(2);
    expect(serializeResumeMarkdown(parsed.document!).source).toContain(
      "第一段\n\n第二段",
    );
  });

  it("keeps the base document when syntax is blocking", () => {
    const baseDocument = createDocument();
    const result = parseResumeMarkdown({
      source: "---\ntitle: broken",
      baseDocument,
      locale: "zh-CN",
    });

    expect(result.document).toBeUndefined();
    expect(result.hasErrors).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "frontmatter_unclosed" }),
    ]);
  });
});
