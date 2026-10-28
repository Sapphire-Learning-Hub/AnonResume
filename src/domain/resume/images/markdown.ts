import type { Image } from "mdast";
import { imageBlockSchema, type ImageBlock } from "@/domain/resume/schema";

const fields = [
  "intrinsicWidth",
  "intrinsicHeight",
  "width",
  "height",
  "fit",
  "positionX",
  "positionY",
  "radius",
  "align",
] as const;
const numericFields = new Set<string>([
  "intrinsicWidth",
  "intrinsicHeight",
  "width",
  "height",
  "positionX",
  "positionY",
  "radius",
]);
const defaults = {
  width: 160,
  height: 160,
  fit: "cover",
  positionX: 50,
  positionY: 50,
  radius: 0,
  align: "left",
} as const;

export function serializeImageMarkdown(block: ImageBlock) {
  const alt = block.alt
    .replaceAll("\\", "\\\\")
    .replace(/[\[\]]/g, "\\$&")
    .replaceAll("\n", " ");
  // The optional standard Markdown title keeps geometry portable without block directives.
  const title = (Object.keys(defaults) as Array<keyof typeof defaults>)
    .filter((key) => block[key] !== defaults[key])
    .map((key) => `${key}=${block[key]}`)
    .join(" ");
  return `![${alt}](anonresume-asset:${block.assetId}${title ? ` "anonresume:${title}"` : ""})`;
}

export function parseImageMarkdown(node: Image, id: string, base?: ImageBlock) {
  const assetId = /^anonresume-asset:([0-9a-f-]+)$/i.exec(node.url)?.[1];
  if (!assetId) return undefined;
  const attributes: Record<string, unknown> = {};
  if (node.title?.startsWith("anonresume:")) {
    for (const entry of node.title.slice(11).split(" ")) {
      const [key, value, extra] = entry.split("=");
      if (
        !key ||
        !value ||
        extra ||
        !fields.some((field) => field === key) ||
        key in attributes
      )
        return undefined;
      attributes[key] = numericFields.has(key) ? Number(value) : value;
    }
  }
  const result = imageBlockSchema.safeParse({
    intrinsicWidth: 160,
    intrinsicHeight: 160,
    width: 160,
    height: 160,
    ...(base?.assetId === assetId ? base : {}),
    ...attributes,
    id,
    type: "image",
    assetId,
    alt: node.alt ?? "",
  });
  return result.success ? result.data : undefined;
}
