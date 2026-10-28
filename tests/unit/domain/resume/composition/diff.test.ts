import { compareResumeDocuments } from "@/domain/resume/document-diff";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createImageBlock } from "@/domain/resume/images/model";
import { createRichTextFromPlainText } from "@/domain/resume/operations";

it("shows a column-layout change in history without treating preserved content as replaced", () => {
  const before = createDefaultResumeDocument();
  before.sections[0]!.blocks = [
    {
      id: "row",
      type: "row",
      children: [
        {
          id: "text",
          type: "text",
          content: createRichTextFromPlainText("Same text"),
        },
        createImageBlock({
          id: crypto.randomUUID(),
          name: "Photo",
          width: 600,
          height: 800,
        }),
      ],
    },
  ];
  const after = structuredClone(before);
  const row = after.sections[0]!.blocks[0]!;
  if (row.type !== "row") throw new Error("fixture");
  row.columnLayout = "image-right";
  const result = compareResumeDocuments(before, after);
  expect(result.changes).toEqual([
    expect.objectContaining({
      nodeId: "row",
      category: "appearance",
      field: "layout",
    }),
  ]);
});
