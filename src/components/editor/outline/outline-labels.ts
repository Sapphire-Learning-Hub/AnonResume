import type { BlockOutlineNode } from "@/domain/resume/block-tree";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import type { useI18n } from "@/i18n/I18nProvider";

export function getOutlineLabel(
  node: BlockOutlineNode,
  t: ReturnType<typeof useI18n>["t"],
  index = 0,
): string {
  const block = node.block;
  if (!block) return t("outline.item", { number: index + 1 });
  switch (block.type) {
    case "text":
      return (
        getPlainTextFromRichText(block.content)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80) || t("renderer.textBlock")
      );
    case "image":
      return block.alt || t("renderer.imageBlock");
    case "row":
      return t(
        block.columnLayout ? "composition.image-right" : "renderer.rowBlock",
      );
    case "group":
      return t("renderer.groupBlock");
    case "list":
      return t("renderer.listBlock");
    case "badges":
      return t("renderer.badgesBlock");
  }
}
