import { richTextContentSchema } from "@/domain/resume/schema";
import { normalizeLinkHref, normalizeRichTextContent } from "@/domain/resume/rich-text";

describe("normalizeRichTextContent", () => {
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
