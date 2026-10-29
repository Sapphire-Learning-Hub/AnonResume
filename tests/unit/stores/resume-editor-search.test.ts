import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { findResumeMatches } from "@/domain/resume/search/document";
import { createResumeEditorStore } from "@/stores/resume-editor";

function fixture() {
  const document = createDefaultResumeDocument();
  document.sections = [
    {
      id: "section",
      visible: true,
      title: createRichTextFromPlainText("one"),
      blocks: [
        {
          id: "text",
          type: "text",
          content: createRichTextFromPlainText("one one"),
        },
      ],
    },
  ];
  return createResumeEditorStore({
    document,
    resumeId: "search-test",
    version: 1,
    updatedAt: 1,
  });
}
const query = { text: "one", caseSensitive: true };

it("records replace-all as one undoable document transaction", () => {
  const store = fixture();
  const original = store.getState().document;
  expect(
    store
      .getState()
      .replaceSearchMatches({
        query,
        replacement: "two",
        expectedDocument: original,
      }),
  ).toEqual({ count: 3, stale: false });
  const replaced = store.getState().document;
  expect(findResumeMatches(replaced, query)).toEqual([]);
  expect(store.getState()).toMatchObject({
    dirty: true,
    saveStatus: "dirty",
    history: { past: [original], future: [] },
  });
  store.getState().undo();
  expect(store.getState().document).toBe(original);
  store.getState().redo();
  expect(store.getState().document).toBe(replaced);
});

it("refuses stale search offsets after another document edit", () => {
  const store = fixture();
  const previous = store.getState().document;
  const match = findResumeMatches(previous, query)[1]!;
  store
    .getState()
    .updateTextBlock({
      sectionId: "section",
      blockPath: ["text"],
      text: "prefix one one",
    });
  const changed = store.getState().document;
  expect(
    store
      .getState()
      .replaceSearchMatches({
        query,
        replacement: "two",
        targetKey: match.key,
        expectedDocument: previous,
      }),
  ).toEqual({ count: 0, stale: true });
  expect(store.getState().document).toBe(changed);
  expect(store.getState().history.past).toHaveLength(1);
});

it("keeps no-op and missing matches out of history and dirty state", () => {
  const store = fixture();
  const expectedDocument = store.getState().document;
  for (const input of [
    { query, replacement: "one" },
    { query: { ...query, text: "" }, replacement: "two" },
    { query, replacement: "two", targetKey: "missing" },
  ]) {
    expect(
      store.getState().replaceSearchMatches({ ...input, expectedDocument }),
    ).toEqual({ count: 0, stale: false });
  }
  expect(store.getState()).toMatchObject({
    dirty: false,
    saveStatus: "idle",
    history: { past: [], future: [] },
  });
  expect(store.getState().document).toBe(expectedDocument);
});
