import type { RichTextContent } from "../schema";
import { serializeResumeMarkdownInline } from "./inline";

type Paragraph = RichTextContent["content"][number];
type Node = Paragraph["content"][number];
type TextNode = Extract<Node, { type: "text" }>;
type Mark = NonNullable<TextNode["marks"]>[number];

function value(node: Node) {
  return node.type === "text"
    ? node.text
    : node.type === "hardBreak"
      ? "\n"
      : `\uFFFC${node.attrs.iconId}\uFFFC`;
}

function text(paragraph: Paragraph) {
  return paragraph.content.map(value).join("");
}

function presentation(marks: Mark[]) {
  return marks.filter(
    (mark) =>
      mark.type === "tag" ||
      mark.type === "underline" ||
      mark.type === "textColor" ||
      (mark.type === "link" &&
        (mark.attrs?.color !== undefined ||
          mark.attrs?.underline !== undefined)),
  );
}

function restoreParagraph(base: Paragraph, parsed: Paragraph) {
  if (
    !parsed.content.some(
      (node) =>
        node.type === "text" && presentation(node.marks ?? []).length > 0,
    ) &&
    serializeResumeMarkdownInline({ type: "doc", content: [base] }) ===
      serializeResumeMarkdownInline({ type: "doc", content: [parsed] })
  ) {
    return { paragraph: structuredClone(base), degraded: false };
  }
  const before = text(base);
  const after = text(parsed);
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const oldEnd = before.length - suffix;
  const newEnd = after.length - suffix;
  const delta = after.length - before.length;
  let offset = 0;
  const ranges = base.content.flatMap((node) => {
    const start = offset;
    offset += value(node).length;
    return node.type === "text"
      ? [{ start, end: offset, marks: node.marks ?? [] }]
      : [];
  });
  // A replacement spanning different hidden styles cannot be attributed safely.
  const affected = ranges.filter(
    (range) => range.start < oldEnd && range.end > prefix,
  );
  if (
    newEnd > prefix &&
    new Set(affected.map((range) => JSON.stringify(presentation(range.marks))))
      .size > 1
  ) {
    return { paragraph: parsed, degraded: true };
  }
  const insertionOwner =
    ranges.find((range) => range.start < prefix && range.end >= prefix) ??
    ranges.find((range) => range.start === prefix);
  const mapped = ranges.map((range) => ({
    ...range,
    start:
      range.start < prefix
        ? range.start
        : range.start >= oldEnd
          ? range.start + delta
          : prefix,
    end:
      range.end <= prefix
        ? range.end
        : range.end >= oldEnd
          ? range.end + delta
          : newEnd,
  }));
  if (prefix === oldEnd && newEnd > prefix && insertionOwner) {
    const owner = mapped[ranges.indexOf(insertionOwner)]!;
    owner.start = Math.min(owner.start, prefix);
    owner.end = Math.max(owner.end, newEnd);
  }
  offset = 0;
  const content: Node[] = [];
  for (const node of parsed.content) {
    const start = offset;
    offset += value(node).length;
    if (node.type !== "text") {
      content.push(node);
      continue;
    }
    const boundaries = [
      ...new Set([
        start,
        offset,
        ...mapped
          .flatMap((range) => [range.start, range.end])
          .filter((point) => point > start && point < offset),
      ]),
    ].sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index++) {
      const left = boundaries[index]!;
      const right = boundaries[index + 1]!;
      const original = mapped.find(
        (range) => range.start <= left && range.end >= right,
      );
      let marks = [...(node.marks ?? [])];
      for (const mark of presentation(original?.marks ?? [])) {
        if (mark.type === "link") {
          marks = marks.map((candidate) =>
            candidate.type === "link" &&
            candidate.attrs?.href === mark.attrs?.href
              ? { ...candidate, attrs: { ...mark.attrs, ...candidate.attrs } }
              : candidate,
          );
        } else if (!marks.some((candidate) => candidate.type === mark.type)) {
          marks.push(mark);
        }
      }
      // Keep original ordering when the same marks survived the conversion.
      const originalMarks = original?.marks ?? [];
      if (
        marks.length === originalMarks.length &&
        marks.every((mark) =>
          originalMarks.some(
            (candidate) => JSON.stringify(candidate) === JSON.stringify(mark),
          ),
        )
      ) {
        marks = [...originalMarks];
      }
      content.push({
        type: "text",
        text: node.text.slice(left - start, right - start),
        ...(marks.length ? { marks } : {}),
      });
    }
  }
  return {
    paragraph: { type: "paragraph" as const, content },
    degraded: false,
  };
}

export function restoreResumeMarkdownInlinePresentation(
  base: RichTextContent,
  parsed: RichTextContent,
) {
  let degraded = false;
  const used = new Set<number>();
  const content = parsed.content.map((paragraph, index) => {
    let baseIndex = base.content.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) && text(candidate) === text(paragraph),
    );
    if (
      baseIndex < 0 &&
      base.content.length === parsed.content.length &&
      !used.has(index)
    )
      baseIndex = index;
    if (baseIndex < 0) {
      degraded ||= base.content.some(
        (candidate, candidateIndex) =>
          !used.has(candidateIndex) &&
          candidate.content.some(
            (node) =>
              node.type === "text" && presentation(node.marks ?? []).length > 0,
          ),
      );
      return paragraph;
    }
    used.add(baseIndex);
    const result = restoreParagraph(base.content[baseIndex]!, paragraph);
    degraded ||= result.degraded;
    return result.paragraph;
  });
  return { content: { type: "doc" as const, content }, degraded };
}
