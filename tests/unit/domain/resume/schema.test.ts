import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { resumeDocumentSchema } from "@/domain/resume/schema";

describe("resumeDocumentSchema", () => {
  it("creates a valid default resume document", () => {
    const parsed = resumeDocumentSchema.parse(createDefaultResumeDocument());

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.semantic).toBe("profile");
    expect(parsed.sections[1]?.semantic).toBe("experience");
  });

  it("accepts nested group and row blocks", () => {
    const document = createDefaultResumeDocument();

    document.sections.push({
      id: "section-experience",
      title: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Experience" }],
          },
        ],
      },
      semantic: "experience",
      visible: true,
      blocks: [
        {
          id: "group-experience-item",
          type: "group",
          direction: "vertical",
          gap: 10,
          children: [
            {
              id: "row-role-header",
              type: "row",
              gap: 12,
              justify: "between",
              children: [
                {
                  id: "text-company-role",
                  type: "text",
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [
                          {
                            type: "text",
                            text: "AnonResume - Frontend Engineer",
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  id: "text-date-range",
                  type: "text",
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [
                          { type: "text", text: "2026.01 - 2026.08" },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const parsed = resumeDocumentSchema.parse(document);

    expect(parsed.sections[1]?.blocks[0]?.type).toBe("group");
  });

  it("accepts supported rich text marks and hard breaks", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.blocks[0] = {
      id: "block-rich-text",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Bold",
                marks: [{ type: "bold" }],
              },
              { type: "hardBreak" },
              {
                type: "text",
                text: "Link",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com" },
                  },
                ],
              },
              {
                type: "text",
                text: " Code",
                marks: [{ type: "code" }],
              },
              {
                type: "text",
                text: " Underline",
                marks: [{ type: "underline" }],
              },
              {
                type: "text",
                text: " Strike",
                marks: [{ type: "strike" }],
              },
            ],
          },
        ],
      },
    };

    const parsed = resumeDocumentSchema.parse(document);
    const firstBlock = parsed.sections[0]?.blocks[0];

    expect(firstBlock?.type).toBe("text");

    if (firstBlock?.type !== "text") {
      throw new Error("Expected the first block to stay a text block");
    }

    expect(firstBlock.content.content[0]?.content).toHaveLength(6);
    expect(firstBlock.content.content[0]?.content[1]?.type).toBe("hardBreak");
  });

  it("accepts a hex text color mark on part of rich text", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.blocks[0] = {
      id: "block-inline-color",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "默认颜色" },
              {
                type: "text",
                text: "局部颜色",
                marks: [{ type: "textColor", attrs: { color: "#be123c" } }],
              },
            ],
          },
        ],
      },
    };

    expect(() => resumeDocumentSchema.parse(document)).not.toThrow();
  });

  it("preserves a valid per-section title color and rejects invalid colors", () => {
    const document = createDefaultResumeDocument();
    const section = document.sections[0] as unknown as {
      titleStyle?: { color?: string };
    };
    section.titleStyle = { color: "#be123c" };

    const parsed = resumeDocumentSchema.parse(document) as typeof document & {
      sections: Array<{ titleStyle?: { color?: string } }>;
    };

    expect(parsed.sections[0]?.titleStyle).toEqual({ color: "#be123c" });

    section.titleStyle = { color: "red" };
    expect(() => resumeDocumentSchema.parse(document)).toThrow();
  });

  it("accepts inline resume icons mixed with text", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.blocks[0] = {
      id: "block-contact",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "resumeIcon",
                attrs: { iconId: "lucide:mail" },
              },
              { type: "text", text: " hello@example.com" },
            ],
          },
        ],
      },
    };

    const parsed = resumeDocumentSchema.parse(document);
    const firstBlock = parsed.sections[0]?.blocks[0];

    expect(firstBlock?.type).toBe("text");

    if (firstBlock?.type !== "text") {
      throw new Error("Expected the contact block to stay a text block");
    }

    expect(firstBlock.content.content[0]?.content[0]).toEqual({
      type: "resumeIcon",
      attrs: { iconId: "lucide:mail" },
    });
  });

  it("creates normalized list items with nested child blocks in the default document", () => {
    const parsed = resumeDocumentSchema.parse(createDefaultResumeDocument());
    const listBlock = parsed.sections[0]?.blocks[1];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected the profile highlights block to stay a list.");
    }

    expect(listBlock.items[0]).toMatchObject({
      id: "item-foundation-1",
      children: [
        {
          type: "text",
        },
      ],
    });
  });

  it("migrates legacy list item content into a default text child block", () => {
    const document = createDefaultResumeDocument();
    const sections = structuredClone(document.sections) as unknown as Array<
      Record<string, unknown>
    >;
    const profileSection = sections[0];
    const profileBlocks = (profileSection?.blocks as Array<Record<string, unknown>>) ?? [];

    profileBlocks[1] = {
      id: "block-profile-highlights",
      type: "list",
      marker: "disc",
      gap: 8,
      items: [
        {
          id: "item-foundation-1",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Legacy highlight" }],
              },
            ],
          },
        },
      ],
    };

    const parsed = resumeDocumentSchema.parse({
      ...document,
      sections,
    } as unknown);
    const listBlock = parsed.sections[0]?.blocks[1];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected the migrated block to stay a list.");
    }

    expect(listBlock.items[0]).toMatchObject({
      id: "item-foundation-1",
      children: [
        {
          id: "item-foundation-1-text",
          type: "text",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Legacy highlight" }],
              },
            ],
          },
        },
      ],
    });
  });
});
