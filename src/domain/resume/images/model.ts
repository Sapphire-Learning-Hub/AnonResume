import { visitResumeBlocks } from "@/domain/resume/block-tree";
import type { ImageBlock, ResumeDocument } from "@/domain/resume/schema";

export function collectImageAssetIds(document: ResumeDocument): string[] {
  const ids = new Set<string>();
  for (const section of document.sections) {
    visitResumeBlocks(section.blocks, (block) => {
      if (block.type === "image") ids.add(block.assetId);
    });
  }
  return [...ids];
}

export function createImageBlock(asset: {
  id: string;
  width: number;
  height: number;
  name: string;
}): ImageBlock {
  const width = Math.min(160, asset.width);
  return {
    id: `image-${crypto.randomUUID()}`,
    type: "image",
    assetId: asset.id,
    alt: asset.name,
    intrinsicWidth: asset.width,
    intrinsicHeight: asset.height,
    width,
    height: Math.min(4096, (width * asset.height) / asset.width),
    fit: "cover",
    positionX: 50,
    positionY: 50,
    radius: 0,
    align: "left",
  };
}
