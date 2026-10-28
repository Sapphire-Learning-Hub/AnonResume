import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createImageBlock } from "@/domain/resume/images/model";
import {
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { validateResumeDocument } from "@/domain/resume/validation";

function fixture() {
  const document = createDefaultResumeDocument("en-US");
  document.sections = [
    {
      id: "section",
      visible: true,
      blocks: [
        {
          id: "row",
          type: "row",
          columnLayout: "image-right",
          gap: 20,
          align: "center",
          children: [
            {
              id: "left",
              type: "group",
              direction: "vertical",
              children: [
                {
                  id: "a",
                  type: "text",
                  content: createRichTextFromPlainText("Original paragraph"),
                },
                {
                  id: "b",
                  type: "badges",
                  wrap: true,
                  items: [{ id: "tag", text: "TypeScript" }],
                },
              ],
            },
            createImageBlock({
              id: crypto.randomUUID(),
              width: 600,
              height: 800,
              name: "Photo",
            }),
          ],
        },
      ],
    },
  ];
  return validateResumeDocument(document);
}

it("retains explicit columns and native text, tags and image syntax without a browser mapping", () => {
  const document = fixture();
  const { source } = serializeResumeMarkdown(document);
  expect(source).toContain('columns="image-right"');
  expect(source).toContain("`TypeScript`");
  expect(source).toContain("![Photo]");
  const result = parseResumeMarkdown({
    source,
    baseDocument: { ...document, sections: [] },
    locale: "en-US",
  });
  expect(result.diagnostics).toEqual([]);
  expect(result.document?.sections[0]?.blocks[0]).toMatchObject({
    type: "row",
    columnLayout: "image-right",
    children: [{ type: "group" }, { type: "image" }],
  });
});

it("preserves identities, geometry and marks through a mapped small text edit", () => {
  const document = fixture();
  const serialized = serializeResumeMarkdown(document);
  const result = parseResumeMarkdown({
    source: serialized.source.replace("Original paragraph", "Edited paragraph"),
    baseDocument: document,
    projection: serialized.projection,
    locale: "en-US",
  });
  expect(result.diagnostics).toEqual([]);
  const expected = structuredClone(document);
  const row = expected.sections[0]!.blocks[0]!;
  if (
    row.type !== "row" ||
    row.children[0]?.type !== "group" ||
    row.children[0].children[0]?.type !== "text"
  )
    throw new Error("fixture");
  row.children[0].children[0].content =
    createRichTextFromPlainText("Edited paragraph");
  expect(result.document).toEqual(expected);
});

it("rejects malformed explicit columns and leaves ordinary schema1 rows unchanged", () => {
  const document = fixture();
  const row = document.sections[0]!.blocks[0]!;
  if (row.type !== "row") throw new Error("fixture");
  row.children.reverse();
  expect(() => validateResumeDocument(document)).toThrow();
  const ordinary = createDefaultResumeDocument();
  expect(validateResumeDocument(ordinary).schemaVersion).toBe(1);
});

it("honors removal of the explicit column rule without replacing its children", () => {
  const document = fixture();
  const serialized = serializeResumeMarkdown(document);
  const result = parseResumeMarkdown({
    source: serialized.source.replace('columns="image-right" ', ""),
    baseDocument: document,
    projection: serialized.projection,
    locale: "en-US",
  });
  expect(result.diagnostics).toEqual([]);
  const row = result.document?.sections[0]?.blocks[0];
  expect(row?.type === "row" ? row.columnLayout : "wrong_type").toBeUndefined();
  const original = document.sections[0]!.blocks[0]!;
  if (original.type !== "row") throw new Error("fixture");
  expect(row?.type === "row" ? row.children : []).toEqual(original.children);
});
