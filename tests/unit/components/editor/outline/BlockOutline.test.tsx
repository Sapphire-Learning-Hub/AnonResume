import { act, fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "zustand";
import { BlockOutline } from "@/components/editor/outline/BlockOutline";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createResumeEditorStore } from "@/stores/resume-editor";

function setup(layout = true) {
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks = [
    {
      id: "group",
      type: "group",
      direction: "vertical",
      gap: 10,
      children: ["A", "B", "C"].map((id) => ({
        id,
        type: "text",
        content: createRichTextFromPlainText(id),
      })),
    },
  ];
  const sectionId = document.sections[0]!.id;
  const store = createResumeEditorStore({
    resumeId: "test",
    document,
    version: 1,
    updatedAt: 0,
  });
  function Harness() {
    const state = useStore(store);
    return (
      <BlockOutline
        document={state.document}
        section={state.document.sections[0]!}
        selection={state.selection}
        layout={layout}
        onSelect={(selection, extend) =>
          state.selectLayoutBlock(selection, extend)
        }
        onMoveRange={state.moveSelectedBlocks}
        onMoveBlock={state.moveBlock}
        onCompose={state.composeBlocks}
      />
    );
  }
  render(<Harness />);
  return { store, document, sectionId };
}

it("selects exact containers, extends sibling ranges and moves the range with one undo step", () => {
  const { store, sectionId } = setup();
  fireEvent.click(screen.getByRole("button", { name: "选择 内容组" }));
  expect(store.getState().selection.blockPath).toEqual(["group"]);
  fireEvent.click(screen.getByRole("button", { name: "选择 A" }));
  fireEvent.click(screen.getByRole("button", { name: "选择 B" }), {
    shiftKey: true,
  });
  expect(store.getState().selection).toEqual({
    sectionId,
    blockPath: ["group", "A"],
    blockRange: ["A", "B"],
  });
  fireEvent.keyDown(screen.getByRole("button", { name: "选择 B" }), {
    key: "ArrowDown",
    altKey: true,
  });
  expect(store.getState().document.sections[0]!.blocks[0]).toMatchObject({
    children: [{ id: "C" }, { id: "A" }, { id: "B" }],
  });
  expect(store.getState().history.past).toHaveLength(1);
});

it("preserves a deliberate fold until a different selection needs to reveal its ancestors", () => {
  const { store, sectionId } = setup();
  fireEvent.click(screen.getByRole("button", { name: "折叠 内容组" }));
  expect(
    screen.queryByRole("button", { name: "选择 A" }),
  ).not.toBeInTheDocument();
  act(() =>
    store.getState().setSelection({ sectionId, blockPath: ["group", "B"] }),
  );
  expect(screen.getByRole("button", { name: "选择 B" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("keeps selection available but disables structure mutation in content mode", () => {
  const { store } = setup(false);
  fireEvent.click(screen.getByRole("button", { name: "选择 B" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "选择 B" }), {
    key: "ArrowUp",
    altKey: true,
  });
  expect(store.getState().selection.blockPath).toEqual(["group", "B"]);
  expect(store.getState().history.past).toHaveLength(0);
});
