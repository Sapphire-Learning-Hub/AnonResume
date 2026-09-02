import type { Paragraph, RootContent } from "mdast";

import type { ResumeImportDiagnostic } from "./types";

export interface MujicvContainerNode {
  type: "mujicvContainer";
  side: "left" | "right";
  children: RootContent[];
  line: number;
  closed: boolean;
}

export type ResumeMarkdownBlockNode = RootContent | MujicvContainerNode;

function getParagraphText(node: RootContent) {
  if (node.type !== "paragraph") {
    return undefined;
  }

  return (node as Paragraph).children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("")
    .trim();
}

function getContainerSide(node: RootContent) {
  const text = getParagraphText(node);
  const match = text?.match(/^:::\s*(left|right)$/i);

  return match?.[1]?.toLocaleLowerCase() as "left" | "right" | undefined;
}

function isContainerClose(node: RootContent) {
  return getParagraphText(node) === ":::";
}

export function containsMujicvSyntax(markdown: string) {
  return (
    /(^|\n)\s*:::\s*(?:left|right)\s*(?:\n|$)/i.test(markdown) ||
    /\bicon:[a-z0-9-]+/i.test(markdown)
  );
}

export function normalizeMujicvBlocks(
  children: RootContent[],
  diagnostics: ResumeImportDiagnostic[],
): ResumeMarkdownBlockNode[] {
  const result: ResumeMarkdownBlockNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]!;
    const side = getContainerSide(node);

    if (!side) {
      result.push(node);
      continue;
    }

    const line = node.position?.start.line ?? 1;
    const containerChildren: RootContent[] = [];
    let closed = false;
    let cursor = index + 1;

    for (; cursor < children.length; cursor += 1) {
      const candidate = children[cursor]!;

      if (isContainerClose(candidate)) {
        closed = true;
        break;
      }

      if (getContainerSide(candidate) || candidate.type === "heading") {
        break;
      }

      containerChildren.push(candidate);
    }

    if (!closed) {
      diagnostics.push({
        severity: "warning",
        code: "mujicv_unclosed_container",
        message: `The Mujicv ${side} container is not closed.`,
        line,
      });
      index = cursor - 1;
    } else {
      index = cursor;
    }

    result.push({
      type: "mujicvContainer",
      side,
      children: containerChildren,
      line,
      closed,
    });
  }

  return result;
}

export function isMujicvContainerNode(
  node: ResumeMarkdownBlockNode,
): node is MujicvContainerNode {
  return node.type === "mujicvContainer";
}
