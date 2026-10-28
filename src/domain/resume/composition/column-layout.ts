import type { RowBlock } from "@/domain/resume/schema";
import { getResumeStructuralBlockGap } from "@/domain/resume/presentation/defaults";

/** Geometry shared by natural-flow measurement and paginated rendering. */
export function getImageRightColumnGeometry(block: RowBlock) {
  const image = block.children[1];
  if (!block.columnLayout || image?.type !== "image") return undefined;
  const ratio = image.width / image.height;
  return {
    display: "grid",
    gridTemplateColumns: `minmax(0, 1fr) min(${image.width}px, 45%, calc(var(--resume-image-page-height, 1000px) * ${ratio}))`,
    columnGap: `min(${getResumeStructuralBlockGap(block)}px, 10%)`,
    rowGap: 0,
    alignItems: "start",
  } as const;
}
