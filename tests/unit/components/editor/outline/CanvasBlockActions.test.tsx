import { fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "zustand";
import { CanvasBlockActions } from "@/components/editor/outline/CanvasBlockActions";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createResumeEditorStore } from "@/stores/resume-editor";
import { createImageBlock } from "@/domain/resume/images/model";

it("selects the exact parent and disables movement at fixed column boundaries", () => {
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks = [
    {
      id: "outer",
      type: "row",
      columnLayout: "image-right",
      gap: 16,
      children: [
        {
          id: "group",
          type: "group",
          direction: "vertical",
          children: [
            {
              id: "text",
              type: "text",
              content: createRichTextFromPlainText("Inner text"),
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
  ];
  const sectionId = document.sections[0]!.id;
  const store = createResumeEditorStore({
    resumeId: "test",
    document,
    version: 1,
    updatedAt: 0,
  });
  store
    .getState()
    .setSelection({ sectionId, blockPath: ["outer", "group", "text"] });
  function Harness() {
    const state = useStore(store);
    return (
      <CanvasBlockActions
        document={state.document}
        selection={state.selection}
        onSelect={state.setSelection}
        onMove={state.moveSelectedBlocks}
        onCompose={state.composeBlocks}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "选择父容器" }));
  expect(store.getState().selection).toEqual({
    sectionId,
    blockPath: ["outer", "group"],
  });
  expect(screen.getByRole("button", { name: "上移" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "下移" })).toBeDisabled();
  expect(store.getState().history.past).toHaveLength(0);
});
