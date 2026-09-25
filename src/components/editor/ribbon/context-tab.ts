import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeBlock } from "@/domain/resume/schema";

export function getContextRibbonKind(
  selection: ResumeEditorSelection,
  blockType?: ResumeBlock["type"],
): "section" | "title" | ResumeBlock["type"] | undefined {
  if (!selection.sectionId) return undefined;
  if (selection.richTextField === "title" && !selection.blockPath?.length) {
    return "title";
  }

  return blockType ?? "section";
}
