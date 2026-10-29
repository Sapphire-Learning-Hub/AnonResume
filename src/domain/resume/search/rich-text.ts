import type { RichTextContent } from "@/domain/resume/schema";
import { findTextMatches } from "./match";
import type { ResumeSearchQuery, RichTextSearchMatch } from "./types";

type Paragraph = RichTextContent["content"][number];
type Node = Paragraph["content"][number];
type TextNode = Extract<Node, { type: "text" }>;

function nodeSize(node: Node) {
  return node.type === "text" ? node.text.length : 1;
}

export function findRichTextMatches(
  content: RichTextContent,
  query: ResumeSearchQuery,
): RichTextSearchMatch[] {
  const matches: RichTextSearchMatch[] = [];
  content.content.forEach((paragraph, paragraphIndex) => {
    let offset = 0;
    let runStart = 0;
    let run = "";
    const flush = () => {
      for (const match of findTextMatches(run, query)) {
        matches.push({
          paragraphIndex,
          ...match,
          from: runStart + match.from,
          to: runStart + match.to,
        });
      }
      run = "";
    };
    for (const node of paragraph.content) {
      if (node.type === "text") {
        if (!run) runStart = offset;
        run += node.text;
      } else flush();
      offset += nodeSize(node);
    }
    flush();
  });
  return matches;
}

function sliceNodes(paragraph: Paragraph, from: number, to: number): Node[] {
  let offset = 0;
  return paragraph.content.flatMap((node): Node[] => {
    const start = offset;
    offset += nodeSize(node);
    if (to <= start || from >= offset) return [];
    if (from <= start && to >= offset) return [node];
    if (node.type !== "text") return [];
    const text = node.text.slice(
      Math.max(0, from - start),
      Math.min(node.text.length, to - start),
    );
    return text ? [{ ...node, text }] : [];
  });
}

function replacementNode(
  paragraph: Paragraph,
  match: RichTextSearchMatch,
  text: string,
): TextNode {
  const nodes = sliceNodes(paragraph, match.from, match.to).filter(
    (node): node is TextNode => node.type === "text",
  );
  const first = nodes[0];
  const link = first?.marks?.find((mark) => mark.type === "link");
  const sameLink =
    link &&
    nodes.every((node) =>
      node.marks?.some(
        (mark) =>
          mark.type === "link" && JSON.stringify(mark) === JSON.stringify(link),
      ),
    );
  const marks = first?.marks?.filter(
    (mark) => mark.type !== "link" || sameLink,
  );
  return { type: "text", text, ...(marks?.length ? { marks } : {}) };
}

function mergeTextNodes(nodes: Node[]): Node[] {
  const result: Node[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      JSON.stringify(node.marks ?? []) === JSON.stringify(previous.marks ?? [])
    ) {
      result[result.length - 1] = {
        ...previous,
        text: previous.text + node.text,
      };
    } else result.push(node);
  }
  return result;
}

export function replaceRichTextMatches(
  content: RichTextContent,
  query: ResumeSearchQuery,
  replacement: string,
  target?: Pick<RichTextSearchMatch, "paragraphIndex" | "from" | "to">,
): { content: RichTextContent; count: number } {
  const matches = findRichTextMatches(content, query).filter(
    (match) =>
      match.text !== replacement &&
      (!target ||
        (match.paragraphIndex === target.paragraphIndex &&
          match.from === target.from &&
          match.to === target.to)),
  );
  if (!matches.length) return { content, count: 0 };
  const paragraphs = content.content.map((paragraph, paragraphIndex) => {
    const selected = matches.filter(
      (match) => match.paragraphIndex === paragraphIndex,
    );
    if (!selected.length) return paragraph;
    const nodes: Node[] = [];
    let cursor = 0;
    for (const match of selected) {
      nodes.push(...sliceNodes(paragraph, cursor, match.from));
      if (replacement)
        nodes.push(replacementNode(paragraph, match, replacement));
      cursor = match.to;
    }
    nodes.push(...sliceNodes(paragraph, cursor, Number.POSITIVE_INFINITY));
    return { ...paragraph, content: mergeTextNodes(nodes) };
  });
  return {
    content: { ...content, content: paragraphs },
    count: matches.length,
  };
}
