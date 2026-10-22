import { prepareTemplateSource } from "@/components/editor/templates/prepare-template-source";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";

it("flushes live edits and Markdown before using the saved version", async () => {
  const state = {
    resumeId: "r",
    version: 1,
    dirty: true,
    document: createResumeDocumentFromTemplate("blank"),
    saveBlockedReason: null,
    saveConflict: undefined,
    saveValidation: undefined,
  };
  const result = await prepareTemplateSource({
    store: { getState: () => state },
    commitActiveEditor: () => {},
    flushMarkdown: async () => true,
    flushSave: async () => {
      state.version = 2;
      state.dirty = false;
    },
  });
  expect(result).toEqual({ resumeId: "r", sourceVersion: 2 });
});
it("does not save invalid Markdown or return a version while newer edits remain dirty", async () => {
  const state = {
    resumeId: "r",
    version: 1,
    dirty: true,
    document: createResumeDocumentFromTemplate("blank"),
    saveBlockedReason: null,
    saveConflict: undefined,
    saveValidation: undefined,
  };
  const flushSave = vi.fn(async () => {
    state.version++;
  });
  const input = {
    store: { getState: () => state },
    commitActiveEditor: () => {},
    flushMarkdown: async () => false,
    flushSave,
  };
  expect(await prepareTemplateSource(input)).toBeNull();
  expect(flushSave).not.toHaveBeenCalled();
  expect(
    await prepareTemplateSource({ ...input, flushMarkdown: async () => true }),
  ).toBeNull();
  expect(flushSave).toHaveBeenCalledTimes(3);
});
