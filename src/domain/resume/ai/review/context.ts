import type { ResumeDocument } from "@/domain/resume/schema";
import { visitResumeBlocks } from "@/domain/resume/block-tree";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { hashAiContent } from "@/domain/resume/ai/content-hash";

export interface ReviewTarget {
  id: string; sectionId: string; blockPath: string[]; text: string;
}
export interface ReviewContext {
  contentHash: string;
  targets: ReviewTarget[];
}

export function buildReviewContext(document: ResumeDocument): ReviewContext {
  const targets: ReviewTarget[] = [];
  for (const section of document.sections) {
    if (section.title) targets.push({ id: section.id, sectionId: section.id, blockPath: [], text: getPlainTextFromRichText(section.title) });
    visitResumeBlocks(section.blocks, (block, blockPath) => {
      if (block.type === "text") targets.push({ id: block.id, sectionId: section.id, blockPath, text: getPlainTextFromRichText(block.content) });
      if (block.type === "badges") {
        for (const item of block.items) targets.push({ id: item.id, sectionId: section.id, blockPath, text: item.text });
      }
    });
  }
  return { targets, contentHash: hashAiContent(targets) };
}

export function isReviewStale(contentHash: string, document: ResumeDocument) {
  return contentHash !== buildReviewContext(document).contentHash;
}
