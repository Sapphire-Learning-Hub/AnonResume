import {
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type { ResumeDocument, RichTextContent } from "@/domain/resume/schema";

function documentWithContent(content: RichTextContent): ResumeDocument {
  const document = createDefaultResumeDocument("zh-CN");
  return {
    ...document,
    sections: [
      {
        id: "section-rich",
        title: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "富文本" }] }],
        },
        visible: true,
        blocks: [{ id: "rich", type: "text", content }],
      },
    ],
  };
}

describe("AnonResume Markdown rich text dialect", () => {
  it("round-trips nested standard and platform marks, breaks, icons, and links", () => {
    const content: RichTextContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "中文 Latin", marks: [{ type: "bold" }, { type: "italic" }] },
            { type: "text", text: " 删除", marks: [{ type: "strike" }] },
            { type: "text", text: " code", marks: [{ type: "code" }] },
            { type: "text", text: " 标签", marks: [{ type: "tag" }, { type: "bold" }] },
            {
              type: "text",
              text: " 彩色下划线",
              marks: [
                { type: "textColor", attrs: { color: "#1677ff" } },
                { type: "underline" },
              ],
            },
            { type: "hardBreak" },
            { type: "resumeIcon", attrs: { iconId: "simple-icons:github" } },
            { type: "text", text: " GitHub " },
            {
              type: "text",
              text: "邮件",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "mailto:test@example.com",
                    title: "发送邮件",
                    color: "inherit",
                    underline: false,
                  },
                },
              ],
            },
            {
              type: "text",
              text: "应用",
              marks: [{ type: "link", attrs: { href: "anonresume://resume/1" } }],
            },
            {
              type: "text",
              text: "无地址",
              marks: [{ type: "link", attrs: { title: "仅标题" } }],
            },
          ],
        },
      ],
    };
    const baseDocument = documentWithContent(content);
    const serialized = serializeResumeMarkdown(baseDocument);

    expect(serialized.source).toContain(":tag[");
    expect(serialized.source).toContain(":color[");
    expect(serialized.source).toContain(":underline[");
    expect(serialized.source).toContain(":icon[simple-icons:github]");
    expect(serialized.source).toContain(
      '(mailto:test@example.com "发送邮件"){color="inherit" underline=false}',
    );

    const parsed = parseResumeMarkdown({
      source: serialized.source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks[0]).toMatchObject({
      type: "text",
      content,
    });
  });

  it("parses nested directives inside standard Markdown marks", () => {
    const baseDocument = documentWithContent({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 富文本[^\n]*\n[^]*$/,
      [
        '## 富文本 {visible=true}',
        "",
        "**重点 :tag[*嵌套*]** 与 :color[:underline[蓝色]]{value=\"#1677ff\"}",
      ].join("\n"),
    );
    const parsed = parseResumeMarkdown({ source, baseDocument, locale: "zh-CN" });
    const block = parsed.document?.sections[0]?.blocks[0];

    expect(parsed.hasErrors).toBe(false);
    expect(block?.type).toBe("text");
    if (block?.type !== "text") throw new Error("Expected text block");
    expect(block.content.content[0]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "嵌套",
          marks: expect.arrayContaining([
            { type: "bold" },
            { type: "tag" },
            { type: "italic" },
          ]),
        }),
        expect.objectContaining({
          text: "蓝色",
          marks: expect.arrayContaining([
            { type: "textColor", attrs: { color: "#1677ff" } },
            { type: "underline" },
          ]),
        }),
      ]),
    );
  });

  it.each([
    ["unknown directive", ":unknown[value]", "inline_unknown_directive"],
    ["unclosed directive", ":tag[value", "inline_unclosed_directive"],
    ["invalid color", ':color[value]{value="red"}', "inline_invalid_color"],
    ["raw HTML", "<script>alert(1)</script>", "raw_html_not_allowed"],
  ])("reports blocking diagnostics for %s", (_name, inline, code) => {
    const baseDocument = documentWithContent({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 富文本[^\n]*\n[^]*$/,
      `## 富文本 {visible=true}\n\n${inline}`,
    );
    const parsed = parseResumeMarkdown({ source, baseDocument, locale: "zh-CN" });

    expect(parsed.hasErrors).toBe(true);
    expect(parsed.document).toBeUndefined();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, severity: "error" })]),
    );
  });
});
