import { fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "zustand";
import { BlockCompositionTools } from "@/components/editor/composition/BlockCompositionTools";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createResumeEditorStore } from "@/stores/resume-editor";

it("groups a selected range in one reversible transaction and disables inapplicable operations", () => {
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks = ["a", "b"].map((id) => ({
    id,
    type: "text",
    content: createRichTextFromPlainText(id),
  }));
  const store = createResumeEditorStore({
    resumeId: "composition",
    document,
    version: 1,
    updatedAt: 1,
  });
  store
    .getState()
    .setSelection({
      sectionId: document.sections[0]!.id,
      blockPath: ["a"],
      blockRange: ["a", "b"],
    });
  function Harness() {
    const state = useStore(store);
    return (
      <>
        <BlockCompositionTools
          document={state.document}
          selection={state.selection}
          enabled
          onCommand={state.composeBlocks}
        />
        <button onClick={state.undo}>Undo</button>
      </>
    );
  }
  render(<Harness />);
  expect(screen.getByRole("button", { name: "图片居右" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "纵向组合" }));
  expect(store.getState().document.sections[0]!.blocks[0]).toMatchObject({
    type: "group",
    children: document.sections[0]!.blocks,
  });
  expect(screen.getByRole("button", { name: "解除组合" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(store.getState().document).toEqual(document);
});
