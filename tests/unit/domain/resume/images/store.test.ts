import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { findBlockByPath } from "@/domain/resume/block-tree";
import { createResumeEditorStore } from "@/stores/resume-editor";

it("inserts an image at the selected nested position and keeps replacement/cropping reversible", () => {
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks = [
    {
      id: "row",
      type: "row",
      children: [
        { id: "text", type: "text", content: { type: "doc", content: [] } },
      ],
    },
  ];
  const store = createResumeEditorStore({
    resumeId: "test",
    version: 1,
    updatedAt: 1,
    document,
  });
  const asset = {
    id: crypto.randomUUID(),
    width: 600,
    height: 800,
    name: "Portrait",
  };
  store.getState().addImage({
    sectionId: document.sections[0]!.id,
    blockPath: ["row", "text"],
    asset,
  });
  const selection = store.getState().selection;
  const before = findBlockByPath(
    store.getState().document.sections[0]!.blocks,
    selection.blockPath!,
  );
  expect(before).toMatchObject({ type: "image", assetId: asset.id });
  expect(selection.blockPath).toHaveLength(2);
  expect(store.getState().document.schemaVersion).toBe(2);
  store.getState().updateBlockSettings({
    sectionId: selection.sectionId!,
    blockPath: selection.blockPath!,
    settings: { type: "image", positionX: 20, radius: 10, width: 120 },
  });
  store.getState().undo();
  expect(
    findBlockByPath(
      store.getState().document.sections[0]!.blocks,
      selection.blockPath!,
    ),
  ).toEqual(before);
  store.getState().redo();
  expect(
    findBlockByPath(
      store.getState().document.sections[0]!.blocks,
      selection.blockPath!,
    ),
  ).toMatchObject({
    positionX: 20,
    radius: 10,
    width: 120,
    intrinsicWidth: 600,
  });
});
