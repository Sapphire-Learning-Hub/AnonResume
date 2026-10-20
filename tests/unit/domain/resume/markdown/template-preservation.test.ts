import {
  formatResumeMarkdown,
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { listResumeTemplates } from "@/domain/resume/templates";
import type { AppLocale } from "@/i18n/messages";
import type { ResumeBlock, RichTextContent } from "@/domain/resume/schema";
import { visitResumeBlocks } from "@/domain/resume/block-tree";
import { escapeResumeMarkdownText } from "@/domain/resume/markdown/inline";

function roundTripBlocks(blocks: ResumeBlock[]) {
  const document = createDefaultResumeDocument("en-US");
  document.sections = [{ id: "section", visible: true, blocks }];
  const serialized = serializeResumeMarkdown(document);
  const formatted = formatResumeMarkdown(serialized.source, document, "en-US", {
    projection: serialized.projection,
  });
  expect(formatted.result.diagnostics).toEqual([]);
  expect(formatted.result.document).toEqual(document);
  return { document, serialized };
}

describe("Markdown preserves resume semantics", () => {
  for (const locale of ["zh-CN", "en-US"] satisfies AppLocale[]) {
    it.each(listResumeTemplates(locale))(
      `preserves the complete $id template without edits (${locale})`,
      ({ document }) => {
        const serialized = serializeResumeMarkdown(document, {
          baseDocumentVersion: 7,
        });
        const result = formatResumeMarkdown(
          serialized.source,
          document,
          locale,
          {
            baseDocumentVersion: 7,
            projection: serialized.projection,
          },
        );

        expect(result.result.diagnostics).toEqual([]);
        expect(result.result.document).toEqual(document);
        expect(result.semanticChanged).toBe(false);
      },
    );
    it.each(listResumeTemplates(locale))(
      `preserves identity and design through repeated small edits in $id (${locale})`,
      ({ document }) => {
        let current = structuredClone(document);
        const expected = structuredClone(document);
        let { source, projection } = serializeResumeMarkdown(current, {
          baseDocumentVersion: 7,
        });
        const ids = (blocks: ResumeBlock[]) => {
          const result: string[] = [];
          visitResumeBlocks(blocks, (block) => result.push(block.id));
          return result;
        };
        for (let turn = 0; turn < 3; turn++) {
          const label = `Review ${turn}`;
          source = source.replace(/^title: .*$/m, `title: "${label}"`);
          expected.meta.title = label;
          let changed = false;
          for (const section of expected.sections) {
            visitResumeBlocks(section.blocks, (block) => {
              if (changed || block.type !== "text") return;
              const node = block.content.content[0]?.content.find(
                (node) =>
                  node.type === "text" &&
                  !node.marks?.length &&
                  node.text.trim().length > 3,
              );
              if (node?.type !== "text") return;
              const before = escapeResumeMarkdownText(node.text);
              const after = escapeResumeMarkdownText(`${node.text} ${turn}`);
              if (!source.includes(before)) return;
              source = source.replace(before, after);
              node.text += ` ${turn}`;
              changed = true;
            });
            if (changed) break;
          }
          expect(changed).toBe(true);
          const formatted = formatResumeMarkdown(source, current, locale, {
            baseDocumentVersion: 7,
            projection,
          });
          expect(formatted.result.diagnostics).toEqual([]);
          expect(formatted.result.document).toEqual(expected);
          expect(
            formatted.result.document?.sections.map((section) =>
              ids(section.blocks),
            ),
          ).toEqual(document.sections.map((section) => ids(section.blocks)));
          current = formatted.result.document!;
          projection = formatted.projection;
        }
      },
    );
  }

  it("encodes a badge collection as badges even without its private projection", () => {
    const base = createDefaultResumeDocument("en-US");
    base.sections = [
      {
        id: "skills",
        visible: true,
        title: createRichTextFromPlainText("Skills"),
        blocks: [
          {
            id: "tags",
            type: "badges",
            wrap: false,
            gap: 6,
            items: [
              { id: "tag-a", text: "C++ [advanced]" },
              { id: "tag-b", text: "TypeScript * React" },
            ],
          },
        ],
      },
    ];
    const serialized = serializeResumeMarkdown(base);
    const parsed = parseResumeMarkdown({
      source: serialized.source,
      baseDocument: { ...base, sections: [] },
      locale: "en-US",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks).toMatchObject([
      {
        type: "badges",
        items: [{ text: "C++ [advanced]" }, { text: "TypeScript * React" }],
      },
    ]);
    expect(
      formatResumeMarkdown(serialized.source, base, "en-US", {
        projection: serialized.projection,
      }).result.document,
    ).toEqual(base);
  });

  it.each([
    "# literal",
    "#",
    "- literal",
    "---",
    "> literal",
    "&amp;",
    "1. literal",
    ":::group",
    ":tag[literal]",
    "~~literal~~",
    "taylor@example.com",
    "https://example.com",
    "www.example.com",
  ])("retains literal text %s", (text) => {
    roundTripBlocks([
      {
        id: "literal",
        type: "text",
        content: createRichTextFromPlainText(text),
      },
    ]);
  });

  it("retains empty paragraphs inside a compound text block", () => {
    roundTripBlocks([
      {
        id: "paragraphs",
        type: "text",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [] },
            { type: "paragraph", content: [{ type: "text", text: "Before" }] },
            { type: "paragraph", content: [] },
            { type: "paragraph", content: [{ type: "text", text: "After" }] },
            { type: "paragraph", content: [] },
          ],
        },
      },
    ]);
  });

  it("retains complex list item boundaries and nested containers", () => {
    roundTripBlocks([
      {
        id: "list",
        type: "list",
        ordered: true,
        items: [
          {
            id: "item",
            children: [
              {
                id: "body",
                type: "text",
                content: createRichTextFromPlainText("First\n\nSecond"),
              },
              {
                id: "tags",
                type: "badges",
                wrap: true,
                items: [{ id: "tag", text: "React" }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("retains adjacent lists as distinct collections when one grows", () => {
    const list = (id: string, label: string): ResumeBlock => ({
      id,
      type: "list",
      marker: "square",
      items: [
        {
          id: `${id}-item`,
          children: [
            {
              id: `${id}-body`,
              type: "text",
              content: createRichTextFromPlainText(label),
            },
          ],
        },
      ],
    });
    const { document, serialized } = roundTripBlocks([
      list("a", "Alpha"),
      list("b", "Beta"),
    ]);
    const edited = formatResumeMarkdown(
      serialized.source.replace("- Alpha", "- Alpha\n- Added"),
      document,
      "en-US",
      { projection: serialized.projection },
    );
    expect(edited.result.diagnostics).toEqual([]);
    expect(edited.result.document?.sections[0]?.blocks).toMatchObject([
      {
        id: "a",
        items: [
          { id: "a-item" },
          { children: [{ content: createRichTextFromPlainText("Added") }] },
        ],
      },
      document.sections[0]!.blocks[1]!,
    ]);
  });

  it("keeps newly inserted badge identities unique across subsequent insertions", () => {
    const { document, serialized } = roundTripBlocks([
      {
        id: "tags",
        type: "badges",
        wrap: true,
        items: [{ id: "original", text: "React" }],
      },
    ]);
    let current = document;
    let { source, projection } = serialized;
    for (const label of ["TypeScript", "Bun", "PostgreSQL"]) {
      source = source.replace("`React`", `\`${label}\` \`React\``);
      const formatted = formatResumeMarkdown(source, current, "en-US", {
        projection,
      });
      expect(formatted.result.diagnostics).toEqual([]);
      current = formatted.result.document!;
      projection = formatted.projection;
      const block = current.sections[0]!.blocks[0]!;
      if (block.type !== "badges") throw new Error("Expected badges");
      expect(new Set(block.items.map((item) => item.id)).size).toBe(
        block.items.length,
      );
      expect(block.items.some((item) => item.text === label)).toBe(true);
      expect(block.items.find((item) => item.text === "React")?.id).toBe(
        "original",
      );
    }
  });

  it.each(["a*b_[c]", "a`b``c", " code ", ":tag[literal]", "&#32;code&#32;"])(
    "retains literal inline code %s",
    (text) => {
      roundTripBlocks([
        {
          id: "code",
          type: "text",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text, marks: [{ type: "code" }] }],
              },
            ],
          },
        },
      ]);
    },
  );

  it.each([
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
    "![photo](https://example.com/photo.png)",
  ])(
    "blocks unsupported Markdown rather than silently discarding it",
    (body) => {
      const document = createDefaultResumeDocument("en-US");
      const result = parseResumeMarkdown({
        source: `## Content\n\n${body}`,
        baseDocument: document,
        locale: "en-US",
      });
      expect(result.hasErrors).toBe(true);
      expect(result.document).toBeUndefined();
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "unsupported_markdown",
          severity: "error",
        }),
      );
    },
  );

  it("does not discard untagged content accidentally inserted in a badge collection", () => {
    const document = createDefaultResumeDocument("en-US");
    const result = parseResumeMarkdown({
      source: "## Skills\n\n:::badges\n:tag[React] missing wrapper\n:::",
      baseDocument: document,
      locale: "en-US",
    });
    expect(result.hasErrors).toBe(true);
    expect(result.document).toBeUndefined();
  });

  it("retains a fenced code block containing directive-looking lines", () => {
    const document = createDefaultResumeDocument("en-US");
    const result = parseResumeMarkdown({
      source: "## Code\n\n```md\n:::row\n\n:::\n```",
      baseDocument: document,
      locale: "en-US",
    });
    expect(result.diagnostics).toEqual([]);
    const block = result.document?.sections[0]?.blocks[0];
    expect(block).toMatchObject({
      type: "text",
      content: {
        content: [
          { content: [{ text: ":::row\n\n:::", marks: [{ type: "code" }] }] },
        ],
      },
    });
    if (!block) throw new Error("Expected code block");
    roundTripBlocks([block]);
  });

  it("does not commit duplicate container identities after interleaving hidden groups", () => {
    const group = (id: string, labels: string[]): ResumeBlock => ({
      id,
      type: "group",
      direction: "vertical",
      children: labels.map((label) => ({
        id: label,
        type: "text",
        content: createRichTextFromPlainText(label),
      })),
    });
    const { document, serialized } = roundTripBlocks([
      group("one", ["Alpha", "Beta"]),
      group("two", ["Gamma", "Delta"]),
    ]);
    const source = serialized.source.replace("Beta\n\nGamma", "Gamma\n\nBeta");
    const result = formatResumeMarkdown(source, document, "en-US", {
      projection: serialized.projection,
    });
    expect(result.result.hasErrors).toBe(true);
    expect(result.result.document).toBeUndefined();
  });

  it("preserves adjacent presentation spans and custom link appearance through edits", () => {
    const content: RichTextContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Blue",
              marks: [{ type: "textColor", attrs: { color: "#1677ff" } }],
            },
            {
              type: "text",
              text: "Red",
              marks: [
                { type: "textColor", attrs: { color: "#ff0000" } },
                { type: "underline" },
              ],
            },
            {
              type: "text",
              text: "Link",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com",
                    color: "inherit",
                    underline: false,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const { document, serialized } = roundTripBlocks([
      { id: "colored", type: "text", content },
    ]);
    const edited = formatResumeMarkdown(
      serialized.source.replace("Blue", "Bluer"),
      document,
      "en-US",
      { projection: serialized.projection },
    );
    expect(edited.result.diagnostics).toEqual([]);
    expect(edited.result.document?.sections[0]?.blocks[0]).toEqual({
      id: "colored",
      type: "text",
      content: {
        ...content,
        content: [
          {
            type: "paragraph",
            content: [
              { ...content.content[0]!.content[0]!, text: "Bluer" },
              ...content.content[0]!.content.slice(1),
            ],
          },
        ],
      },
    });
  });
});
