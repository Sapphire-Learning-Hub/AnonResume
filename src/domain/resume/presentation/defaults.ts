import type { ResumeBlock } from "@/domain/resume/schema";

export const RESUME_DEFAULT_PAGE_SECTION_GAP_PX = 20;
export const RESUME_DEFAULT_SECTION_TITLE_GAP_PX = 20;
export const RESUME_DEFAULT_BLOCK_GAP_PX = 10;
export const RESUME_DEFAULT_LIST_ITEM_GAP_PX = 8;
export const RESUME_DEFAULT_BADGE_GAP_PX = 8;
export const RESUME_DEFAULT_SECTION_TITLE_FONT_SIZE_PX = 24;
export const RESUME_DEFAULT_SECTION_COLUMNS = 1;
export const RESUME_DEFAULT_SECTION_PADDING_PX = 0;
export const RESUME_DEFAULT_TEXT_FONT_WEIGHT = 400;

export function getResumeStructuralBlockGap(
  block: Exclude<ResumeBlock, { type: "text" }>,
) {
  if (block.gap !== undefined) {
    return block.gap;
  }

  if (block.type === "list") {
    return RESUME_DEFAULT_LIST_ITEM_GAP_PX;
  }

  if (block.type === "badges") {
    return RESUME_DEFAULT_BADGE_GAP_PX;
  }

  return RESUME_DEFAULT_BLOCK_GAP_PX;
}
