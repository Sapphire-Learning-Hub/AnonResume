import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  createRichTextFromPlainText,
  removeBlockFromDocument,
} from "@/domain/resume/operations";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  composeResumeBlocks,
  extendBlockSelection,
} from "@/domain/resume/composition/operations";
import { createImageBlock } from "@/domain/resume/images/model";
import { createResumeEditorStore } from "@/stores/resume-editor";
import type { ResumeBlock } from "@/domain/resume/schema";

function fixture() {
  const document = createDefaultResumeDocument();
  const a: ResumeBlock = {
    id: "a",
    type: "text",
    content: createRichTextFromPlainText("Original A"),
  };
  const b: ResumeBlock = {
    id: "b",
    type: "text",
    content: createRichTextFromPlainText("Original B"),
  };
  const image = createImageBlock({
    id: crypto.randomUUID(),
    width: 600,
    height: 800,
    name: "Photo",
  });
  document.sections[0]!.blocks = [a, b, image];
  const sectionId = document.sections[0]!.id;
  const selection = {
    sectionId,
    blockPath: ["a"],
    blockRange: ["a", "b", image.id],
  };
  return { document, sectionId, selection, a, b, image };
}

it("composes an image-right row without replacing content or image identities", () => {
  const { document, selection, a, b, image } = fixture();
  const result = composeResumeBlocks(document, selection, "image-right");
  const row = result.document.sections[0]!.blocks[0]!;
  expect(row).toMatchObject({
    type: "row",
    columnLayout: "image-right",
    children: [{ type: "group", children: [a, b] }, image],
  });
  expect(result.document.schemaVersion).toBe(2);
  expect(document.sections[0]!.blocks).toEqual([a, b, image]);
});

it("validates contiguous siblings and starts a new selection across parent boundaries", () => {
  const { document, sectionId, a, b, image } = fixture();
  expect(
    composeResumeBlocks(
      document,
      { sectionId, blockPath: [a.id], blockRange: [a.id, image.id] },
      "group",
    ).document,
  ).toBe(document);
  const grouped = composeResumeBlocks(
    document,
    { sectionId, blockPath: [a.id], blockRange: [a.id, b.id] },
    "group",
  );
  const group = grouped.document.sections[0]!.blocks[0]!;
  expect(
    extendBlockSelection(
      grouped.document,
      { sectionId, blockPath: [group.id, a.id] },
      { sectionId, blockPath: [image.id] },
    ),
  ).toEqual({ sectionId, blockPath: [image.id] });
  expect(
    extendBlockSelection(
      document,
      { sectionId, blockPath: [image.id] },
      { sectionId, blockPath: [a.id] },
    ).blockRange,
  ).toEqual([a.id, b.id, image.id]);
});

it("unwraps only one level and moves in and out without empty containers", () => {
  const { document, sectionId, a, b, image } = fixture();
  const grouped = composeResumeBlocks(
    document,
    { sectionId, blockPath: [a.id], blockRange: [a.id, b.id] },
    "group",
  );
  const group = grouped.document.sections[0]!.blocks[0]!;
  const moved = composeResumeBlocks(
    grouped.document,
    { sectionId, blockPath: [image.id] },
    "into-previous",
  );
  expect(moved.document.sections[0]!.blocks).toEqual([
    { ...group, children: [a, b, image] },
  ]);
  const out = composeResumeBlocks(moved.document, moved.selection, "out");
  expect(out.document.sections[0]!.blocks).toEqual(
    grouped.document.sections[0]!.blocks,
  );
  const unwrapped = composeResumeBlocks(
    grouped.document,
    grouped.selection,
    "ungroup",
  );
  expect(unwrapped.document.sections[0]!.blocks).toEqual(
    document.sections[0]!.blocks,
  );
  const single = {
    ...document,
    sections: [
      {
        ...document.sections[0]!,
        blocks: [
          {
            id: "g",
            type: "group" as const,
            direction: "vertical" as const,
            children: [a],
          },
          b,
        ],
      },
    ],
  };
  expect(
    composeResumeBlocks(single, { sectionId, blockPath: ["g", "a"] }, "out")
      .document.sections[0]!.blocks,
  ).toEqual([a, b]);
});

it("records a successful composition as one undo step, rejects stale commands without history", () => {
  const { document, selection } = fixture();
  const store = createResumeEditorStore({
    resumeId: "composition",
    document,
    version: 1,
    updatedAt: 1,
  });
  store.getState().setSelection(selection);
  store.getState().composeBlocks("image-right");
  expect(store.getState().history.past).toHaveLength(1);
  store.getState().undo();
  expect(store.getState().document).toEqual(document);
  expect(store.getState().selection.blockRange).toBeUndefined();
  store
    .getState()
    .setSelection({ sectionId: selection.sectionId, blockPath: ["missing"] });
  store.getState().composeBlocks("group");
  expect(store.getState().history.past).toHaveLength(0);
});

it("keeps fixed column boundaries valid when extracting content or deleting a column", () => {
  const { document, selection, sectionId, a } = fixture();
  const composed = composeResumeBlocks(
    document,
    selection,
    "image-right",
  ).document;
  const row = composed.sections[0]!.blocks[0]!;
  if (row.type !== "row") throw new Error("fixture");
  expect(
    composeResumeBlocks(
      composed,
      { sectionId, blockPath: [row.id, row.children[0]!.id, a.id] },
      "out",
    ).document,
  ).toBe(composed);
  const removed = removeBlockFromDocument({
    document: composed,
    sectionId,
    blockPath: [row.id, row.children[1]!.id],
  });
  expect(() => validateResumeDocument(removed)).not.toThrow();
  expect(removed.sections[0]!.blocks[0]).not.toHaveProperty("columnLayout");
});

it("refuses combinations that would exceed the document nesting limit", () => {
  const { document, sectionId, a, b } = fixture();
  let children: ResumeBlock[] = [a, b];
  for (let i = 4; i >= 0; i--)
    children = [
      { id: `g${i}`, type: "group", direction: "vertical", children },
    ];
  document.sections[0]!.blocks = children;
  expect(() => validateResumeDocument(document)).not.toThrow();
  const selection = {
    sectionId,
    blockPath: ["g0", "g1", "g2", "g3", "g4", "a"],
    blockRange: ["a", "b"],
  };
  expect(composeResumeBlocks(document, selection, "group").document).toBe(
    document,
  );
});

it("keeps fixed columns valid through existing move, duplicate and insert commands", () => {
  const { document, selection, sectionId } = fixture();
  const composed = composeResumeBlocks(document, selection, "image-right").document;
  const row = composed.sections[0]!.blocks[0]!;
  if (row.type !== "row") throw new Error("fixture");
  const store = createResumeEditorStore({ resumeId: "columns", document: composed, version: 1, updatedAt: 1 });
  const imagePath = [row.id, row.children[1]!.id];
  store.getState().moveBlock({ sectionId, blockPath: imagePath, toIndex: 0 });
  expect(store.getState().document).toBe(composed);
  store.getState().duplicateBlock({ sectionId, blockPath: imagePath });
  expect(store.getState().document.sections[0]!.blocks).toHaveLength(2);
  expect(store.getState().selection.blockPath).toHaveLength(1);
  store.getState().addBlock({ sectionId, blockPath: imagePath, presetId: "text" });
  expect(store.getState().document.sections[0]!.blocks).toHaveLength(3);
  expect(store.getState().document.sections[0]!.blocks[0]).toEqual(row);
  expect(() => validateResumeDocument(store.getState().document)).not.toThrow();
});
