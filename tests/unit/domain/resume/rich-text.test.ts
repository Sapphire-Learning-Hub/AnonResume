import { richTextContentSchema } from "@/domain/resume/schema";
import {
  normalizeLinkHref,
  normalizeRichTextContent,
  removeInlineTextColorMarks,
} from "@/domain/resume/rich-text";

describe("normalizeRichTextContent", () => {
  it("normalizes an empty Tiptap paragraph into an editable empty paragraph", () => {
    expect(
      normalizeRichTextContent({
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    ).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
  });

  it("strips unsupported attrs while preserving supported rich text nodes", () => {
    const normalized = normalizeRichTextContent({
      type: "doc",
      attrs: { ignored: true },
      content: [
        {
          type: "paragraph",
          attrs: { ignored: true },
          content: [
            {
              type: "text",
              text: "Portfolio",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com",
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                },
              ],
            },
            { type: "hardBreak", attrs: { ignored: true } },
            {
              type: "text",
              text: "Bold",
              marks: [{ type: "bold", attrs: { ignored: true } }],
            },
          ],
        },
      ],
    });

    expect(() => richTextContentSchema.parse(normalized)).not.toThrow();
    expect(normalized).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Portfolio",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com" },
                },
              ],
            },
            { type: "hardBreak" },
            {
              type: "text",
              text: "Bold",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    });
  });

  it("drops incomplete link marks emitted by the editor instead of throwing", () => {
    const normalized = normalizeRichTextContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "个人" },
            {
              type: "text",
              text: "简介",
              marks: [{ type: "link", attrs: { href: "" } }],
            },
          ],
        },
      ],
    });

    expect(normalized).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "个人" },
            { type: "text", text: "简介", marks: [] },
          ],
        },
      ],
    });
  });

  it("preserves non-empty custom links before they become link marks", () => {
    expect(normalizeLinkHref("my-resume-app://portfolio/42")).toBe(
      "my-resume-app://portfolio/42",
    );
    expect(normalizeLinkHref(" ")).toBeUndefined();
  });

  it("preserves only the hex color attribute of inline text color marks", () => {
    expect(
      normalizeRichTextContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "局部颜色",
                marks: [
                  {
                    type: "textColor",
                    attrs: { color: "#BE123C", ignored: "value" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "局部颜色",
              marks: [{ type: "textColor", attrs: { color: "#BE123C" } }],
            },
          ],
        },
      ],
    });
  });

  it("removes inline colors without removing unrelated marks", () => {
    expect(
      removeInlineTextColorMarks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "保留粗体",
                marks: [
                  { type: "bold" },
                  { type: "textColor", attrs: { color: "#be123c" } },
                ],
              },
              {
                type: "text",
                text: "移除纯颜色",
                marks: [
                  { type: "textColor", attrs: { color: "#2563eb" } },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "保留粗体",
              marks: [{ type: "bold" }],
            },
            { type: "text", text: "移除纯颜色" },
          ],
        },
      ],
    });
  });

  it("preserves inline resume icons while stripping unsupported attrs", () => {
    const normalized = normalizeRichTextContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "resumeIcon",
              attrs: {
                iconId: "simple-icons:github",
                injectedSvg: "<svg />",
              },
            },
            { type: "text", text: " GitHub" },
          ],
        },
      ],
    });

    expect(normalized).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "resumeIcon",
              attrs: { iconId: "simple-icons:github" },
            },
            { type: "text", text: " GitHub" },
          ],
        },
      ],
    });
  });
});
