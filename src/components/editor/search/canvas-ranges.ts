import { z } from "zod";
import { findBlockByPath } from "@/domain/resume/block-tree";
import type { ResumeDocument, RichTextContent } from "@/domain/resume/schema";
import type { ResumeSearchMatch } from "@/domain/resume/search/types";
import { createDomTextRanges } from "@/components/resume/search/dom-ranges";

const pointSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  nodeIndex: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});
const rangeSchema = z.object({ from: pointSchema, to: pointSchema });

function fragmentStart(element: Element, content: RichTextContent) {
  const raw = element
    .closest("[data-resume-source-range]")
    ?.getAttribute("data-resume-source-range");
  const fallback = { paragraphIndex: 0, nodeIndex: 0, offset: 0 };
  if (!raw) return fallback;
  try {
    const range = rangeSchema.safeParse(JSON.parse(raw));
    if (!range.success) return fallback;
    const start = { ...range.data.from };
    const paragraph = content.content[start.paragraphIndex];
    const node = paragraph?.content[start.nodeIndex];
    if (
      node &&
      start.offset === (node.type === "text" ? node.text.length : 1)
    ) {
      start.nodeIndex += 1;
      start.offset = 0;
    }
    if (
      paragraph?.content.length &&
      start.nodeIndex === paragraph.content.length
    ) {
      start.paragraphIndex += 1;
      start.nodeIndex = 0;
      start.offset = 0;
    }
    return start;
  } catch {
    return fallback;
  }
}

export function resolveCanvasSearchRanges(
  root: HTMLElement,
  document: ResumeDocument,
  match: ResumeSearchMatch,
): Range[] {
  const section = document.sections.find(
    (candidate) => candidate.id === match.sectionId,
  );
  if (!section) return [];
  const sections = Array.from(
    root.querySelectorAll<HTMLElement>("[data-resume-section-id]"),
  ).filter((element) => element.dataset.resumeSectionId === section.id);
  const fields = sections.flatMap((element) =>
    match.field === "title"
      ? Array.from(
          element.querySelectorAll<HTMLElement>("[data-resume-section-title]"),
        )
      : Array.from(
          element.querySelectorAll<HTMLElement>("[data-resume-block-path]"),
        ).filter(
          (block) =>
            block.dataset.resumeBlockPath === match.blockPath.join("::"),
        ),
  );
  const seen = new Set<Element>();
  if (match.field === "badge")
    return fields.flatMap((field) =>
      Array.from(
        field.querySelectorAll<HTMLElement>("[data-resume-badge-item-id]"),
      ).flatMap((item) => {
        if (
          item.dataset.resumeBadgeItemId !== match.badgeItemId ||
          seen.has(item) ||
          item.closest('[aria-hidden="true"]')
        )
          return [];
        seen.add(item);
        return createDomTextRanges(item, match.from, match.to);
      }),
    );
  const block = findBlockByPath(section.blocks, match.blockPath);
  const content =
    match.field === "title"
      ? section.title
      : block?.type === "text"
        ? block.content
        : undefined;
  if (!content) return [];
  return fields.flatMap((field) =>
    Array.from(
      field.querySelectorAll<HTMLElement>(
        '[data-resume-rich-node-type="text"]',
      ),
    ).flatMap((element) => {
      if (seen.has(element) || element.closest('[aria-hidden="true"]'))
        return [];
      seen.add(element);
      const start =
        match.field === "content"
          ? fragmentStart(element, content)
          : { paragraphIndex: 0, nodeIndex: 0, offset: 0 };
      const localParagraph = Number(element.dataset.resumeRichParagraphIndex);
      const paragraphIndex = localParagraph + start.paragraphIndex;
      if (paragraphIndex !== match.paragraphIndex) return [];
      const nodeIndex =
        Number(element.dataset.resumeRichNodeIndex) +
        (localParagraph === 0 ? start.nodeIndex : 0);
      const paragraph = content.content[paragraphIndex];
      if (!paragraph) return [];
      const base =
        paragraph.content
          .slice(0, nodeIndex)
          .reduce(
            (sum, node) => sum + (node.type === "text" ? node.text.length : 1),
            0,
          ) +
        (localParagraph === 0 && nodeIndex === start.nodeIndex
          ? start.offset
          : 0);
      return createDomTextRanges(
        element,
        Math.max(0, match.from - base),
        Math.min(element.textContent?.length ?? 0, match.to - base),
      );
    }),
  );
}
