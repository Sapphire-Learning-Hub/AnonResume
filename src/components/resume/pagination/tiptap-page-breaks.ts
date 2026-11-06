import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { RichTextContent } from "@/domain/resume/schema";
import type { RichTextPosition } from "@/domain/resume/page-flow/rich-text-range";
import type { MeasuredRichTextLine } from "@/domain/resume/pagination";

import { measureInlineSegments } from "./rich-text-line-measurement";

export interface TiptapPageBreak {
  id: string;
  position: RichTextPosition;
  height: number;
  pageIndex: number;
}

interface ResolvedPageBreak extends TiptapPageBreak {
  proseMirrorPosition: number;
}

const pageBreakPluginKey = new PluginKey<DecorationSet>(
  "resumePageBreaks",
);

function getParagraphStart(doc: ProseMirrorNode, paragraphIndex: number) {
  let position = 1;

  for (let index = 0; index < paragraphIndex; index += 1) {
    const paragraph = doc.child(index);
    position += paragraph.nodeSize;
  }

  return position;
}

// ProseMirror merges adjacent text with equivalent marks. Pagination positions
// belong to the source document, so map through cumulative inline lengths rather
// than assuming its node indexes survive the editor's normalization.
function paragraphNodes(
  paragraph: ProseMirrorNode,
  source?: RichTextContent["content"][number],
) {
  const nodes = source
    ? source.content.map((node) => ({
        size: node.type === "text" ? node.text.length : 1,
        hardBreak: node.type === "hardBreak",
      }))
    : Array.from({ length: paragraph.childCount }, (_, index) => {
        const node = paragraph.child(index);
        return {
          size: node.isText ? node.text?.length ?? 0 : 1,
          hardBreak: node.type?.name === "hardBreak",
        };
      });
  // During a content update the editor and React source can briefly differ.
  // Wait for the matching document instead of installing invalid decorations.
  if (source && nodes.reduce((sum, node) => sum + node.size, 0) !== paragraph.nodeSize - 2) return undefined;
  return nodes;
}

export function resolveRichTextPosition(
  doc: ProseMirrorNode,
  position: RichTextPosition,
  source?: RichTextContent,
) {
  if (source && source.content.length !== doc.childCount) return undefined;
  if (position.paragraphIndex < 0 || position.paragraphIndex >= doc.childCount) return undefined;
  const nodes = paragraphNodes(doc.child(position.paragraphIndex), source?.content[position.paragraphIndex]);
  if (!nodes || position.nodeIndex < 0 || position.nodeIndex > nodes.length) return undefined;
  const nodeSize = nodes[position.nodeIndex]?.size ?? 0;
  if (position.offset < 0 || position.offset > nodeSize) return undefined;
  return getParagraphStart(doc, position.paragraphIndex) +
    nodes.slice(0, position.nodeIndex).reduce((sum, node) => sum + node.size, 0) + position.offset;
}

function createPageBreakElement(
  pageBreak: ResolvedPageBreak,
  className: string,
) {
  const element = document.createElement("span");

  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("contenteditable", "false");
  element.dataset.resumePageBreak = "true";
  element.dataset.resumePageBreakId = pageBreak.id;
  element.dataset.resumePageIndex = String(pageBreak.pageIndex);
  element.style.height = `${Math.max(0, pageBreak.height)}px`;

  return element;
}

function createDecorationSet(
  doc: ProseMirrorNode,
  pageBreaks: readonly ResolvedPageBreak[],
  className: string,
) {
  return DecorationSet.create(
    doc,
    pageBreaks.map((pageBreak) =>
      Decoration.widget(
        pageBreak.proseMirrorPosition,
        () => createPageBreakElement(pageBreak, className),
        { key: pageBreak.id, side: -1 },
      ),
    ),
  );
}

export function createTiptapPageBreakExtension(className: string) {
  return Extension.create({
    name: "resumePageBreaks",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: pageBreakPluginKey,
          state: {
            init: () => DecorationSet.empty,
            apply(transaction, current, _oldState, newState) {
              const replacement = transaction.getMeta(pageBreakPluginKey) as
                | readonly ResolvedPageBreak[]
                | undefined;

              return replacement
                ? createDecorationSet(newState.doc, replacement, className)
                : current.map(transaction.mapping, transaction.doc);
            },
          },
          props: {
            decorations(state) {
              return pageBreakPluginKey.getState(state);
            },
          },
        }),
      ];
    },
  });
}

export function applyTiptapPageBreaks(
  editor: Editor,
  pageBreaks: readonly TiptapPageBreak[],
  source?: RichTextContent,
) {
  const resolved = pageBreaks.flatMap((pageBreak) => {
    const proseMirrorPosition = resolveRichTextPosition(
      editor.state.doc,
      pageBreak.position,
      source,
    );

    return proseMirrorPosition === undefined
      ? []
      : [{ ...pageBreak, proseMirrorPosition }];
  });

  editor.view.dispatch(
    editor.state.tr.setMeta(pageBreakPluginKey, resolved),
  );
}

interface DomainSegment {
  from: RichTextPosition;
  to: RichTextPosition;
  proseMirror: number;
}

function listDomainSegments(doc: ProseMirrorNode, source?: RichTextContent) {
  if (source && source.content.length !== doc.childCount) return undefined;
  const segments: DomainSegment[] = [];

  for (
    let paragraphIndex = 0;
    paragraphIndex < doc.childCount;
    paragraphIndex += 1
  ) {
    const paragraph = doc.child(paragraphIndex);
    const nodes = paragraphNodes(paragraph, source?.content[paragraphIndex]);
    if (!nodes) return undefined;
    const paragraphStart = getParagraphStart(doc, paragraphIndex);
    let nodeStart = paragraphStart;

    if (nodes.length === 0) {
      segments.push({
        from: { paragraphIndex, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: paragraphIndex + 1, nodeIndex: 0, offset: 0 },
        proseMirror: paragraphStart,
      });
      continue;
    }

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const nodeSize = nodes[nodeIndex]!.size;

      for (let offset = 0; offset < nodeSize; offset += 1) {
        segments.push({
          from: { paragraphIndex, nodeIndex, offset },
          to: { paragraphIndex, nodeIndex, offset: offset + 1 },
          proseMirror: nodeStart + offset,
        });
      }

      nodeStart += nodeSize;
    }

    // ProseMirror renders a caret line after a terminal hard break. It has no
    // content node, but still occupies a line and may begin the next page.
    if (nodes.at(-1)?.hardBreak) {
      segments.push({
        from: { paragraphIndex, nodeIndex: nodes.length, offset: 0 },
        to: { paragraphIndex: paragraphIndex + 1, nodeIndex: 0, offset: 0 },
        proseMirror: nodeStart,
      });
    }
  }

  return segments;
}

export function measureTiptapRichTextLines(
  editor: Editor,
  source?: RichTextContent,
): MeasuredRichTextLine[] | undefined {
  const segments = listDomainSegments(editor.state.doc, source);
  if (!segments) return undefined;

  if (segments.length === 0) {
    return [];
  }

  try {
    const measured = segments.map((segment) => ({
      ...segment,
      rect: editor.view.coordsAtPos(segment.proseMirror, 1),
    }));
    return measureInlineSegments(measured);
  } catch {
    return undefined;
  }
}
