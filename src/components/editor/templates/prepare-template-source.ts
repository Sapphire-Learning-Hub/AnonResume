import type { ResumeEditorState } from "@/stores/resume-editor";
import type { TemplateSource } from "@/lib/resume/templates/types";

type State = Pick<
  ResumeEditorState,
  | "resumeId"
  | "version"
  | "document"
  | "dirty"
  | "saveBlockedReason"
  | "saveConflict"
  | "saveValidation"
>;
export async function prepareTemplateSource({
  store,
  commitActiveEditor,
  flushMarkdown,
  flushSave,
}: {
  store: { getState: () => State };
  commitActiveEditor: () => void;
  flushMarkdown: () => Promise<boolean>;
  flushSave: () => Promise<void>;
}): Promise<TemplateSource | null> {
  commitActiveEditor();
  if (!(await flushMarkdown())) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = store.getState();
    if (state.saveBlockedReason || state.saveConflict || state.saveValidation)
      return null;
    await flushSave();
    const current = store.getState();
    if (
      !current.dirty &&
      !current.saveBlockedReason &&
      !current.saveConflict &&
      !current.saveValidation
    )
      return { resumeId: current.resumeId, sourceVersion: current.version };
  }
  return null;
}
