import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { getBlockOutlineTree } from "@/domain/resume/block-tree";
import { moveSelectedBlocks } from "@/domain/resume/composition/ordering";
import { createResumeEditorStore } from "@/stores/resume-editor";
import type { ResumeBlock } from "@/domain/resume/schema";
import { createImageBlock } from "@/domain/resume/images/model";

function fixture() {
  const document = createDefaultResumeDocument();
  const blocks: ResumeBlock[] = ["a", "b", "c", "d"].map((id) => ({
    id,
    type: "text",
    content: createRichTextFromPlainText(id),
  }));
  document.sections[0]!.blocks = blocks;
  const sectionId = document.sections[0]!.id;
  const selection = { sectionId, blockPath: ["c"], blockRange: ["b", "c"] };
  return { document, sectionId, blocks, selection };
}

it("moves a contiguous range as one unit using its final start index", () => {
  const { document, blocks, selection } = fixture();
  const result = moveSelectedBlocks(document, selection, 2);
  expect(result.document.sections[0]!.blocks).toEqual([
    blocks[0],
    blocks[3],
    blocks[1],
    blocks[2],
  ]);
  expect(result.selection).toEqual(selection);
  expect(
    moveSelectedBlocks(result.document, result.selection, 0).document
      .sections[0]!.blocks,
  ).toEqual([blocks[1], blocks[2], blocks[0], blocks[3]]);
  expect(document.sections[0]!.blocks).toEqual(blocks);
});

it("rejects stale ranges, invalid destinations and direct fixed columns", () => {
  const { document, selection, blocks, sectionId } = fixture();
  for (const to of [-1, 1, 3, 0.5, Number.NaN])
    expect(moveSelectedBlocks(document, selection, to).document).toBe(document);
  expect(
    moveSelectedBlocks(document, { ...selection, blockRange: ["a", "c"] }, 0)
      .document,
  ).toBe(document);
  const image = createImageBlock({
    id: crypto.randomUUID(),
    width: 600,
    height: 800,
    name: "Photo",
  });
  document.sections[0]!.blocks = [
    {
      id: "row",
      type: "row",
      gap: 16,
      align: "start",
      justify: "between",
      columnLayout: "image-right",
      children: [blocks[0]!, image],
    },
  ];
  expect(
    moveSelectedBlocks(document, { sectionId, blockPath: ["row", image.id] }, 0)
      .document,
  ).toBe(document);
});

it("records a range move as one reversible store transaction", () => {
  const { document, selection, blocks } = fixture();
  const store = createResumeEditorStore({
    resumeId: "test",
    document,
    version: 1,
    updatedAt: 0,
  });
  store.getState().setSelection(selection);
  store.getState().moveSelectedBlocks(0);
  expect(store.getState().document.sections[0]!.blocks).toEqual([
    blocks[1],
    blocks[2],
    blocks[0],
    blocks[3],
  ]);
  expect(store.getState().history.past).toHaveLength(1);
  store.getState().undo();
  expect(store.getState().document).toEqual(document);
  store.getState().redo();
  expect(store.getState().document.sections[0]!.blocks).toEqual([
    blocks[1],
    blocks[2],
    blocks[0],
    blocks[3],
  ]);
});

it("derives exact nested list-item boundaries without duplicating content nodes", () => {
  const { blocks } = fixture();
  const tree = getBlockOutlineTree([
    {
      id: "list",
      type: "list",
      ordered: false,
      items: [{ id: "item", children: [blocks[0]!] }],
    },
  ]);
  expect(tree[0]?.path).toEqual(["list"]);
  expect(tree[0]?.children[0]).toMatchObject({
    kind: "item",
    path: ["list", "item"],
    children: [{ path: ["list", "item", "a"], block: blocks[0] }],
  });
});
