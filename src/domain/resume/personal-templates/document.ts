import { normalizeResumeDocumentStructure } from "@/domain/resume/block-tree";
import type { ResumeDocument } from "@/domain/resume/schema";
import { validateResumeDocument } from "@/domain/resume/validation";

export function createPersonalTemplateDocument(
  document: unknown,
): ResumeDocument {
  const snapshot = normalizeResumeDocumentStructure(
    validateResumeDocument(structuredClone(document)),
  );
  delete snapshot.meta.import;
  return snapshot;
}

export function instantiatePersonalTemplateDocument(
  document: unknown,
  title: string,
): ResumeDocument {
  const snapshot = createPersonalTemplateDocument(document);
  snapshot.meta.title = title;
  return validateResumeDocument(snapshot);
}
