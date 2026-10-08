import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { RichTextPosition } from "@/domain/resume/page-flow/rich-text-range";
import type { MeasuredRichTextLine } from "@/domain/resume/pagination";

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

export function resolveRichTextPosition(
  doc: ProseMirrorNode,
  position: RichTextPosition,
) {
  if (
    position.paragraphIndex < 0 ||
    position.paragraphIndex >= doc.childCount
  ) {
    return undefined;
  }

  const paragraph = doc.child(position.paragraphIndex);

  if (position.nodeIndex < 0 || position.nodeIndex > paragraph.childCount) {
    return undefined;
  }

  let resolved = getParagraphStart(doc, position.paragraphIndex);

  for (let index = 0; index < position.nodeIndex; index += 1) {
    resolved += paragraph.child(index).nodeSize;
  }

  if (position.nodeIndex === paragraph.childCount) {
    return position.offset === 0 ? resolved : undefined;
  }

  const node = paragraph.child(position.nodeIndex);
  const nodeSize = node.isText ? node.text?.length ?? 0 : 1;

  return position.offset >= 0 && position.offset <= nodeSize
    ? resolved + position.offset
    : undefined;
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
) {
  const resolved = pageBreaks.flatMap((pageBreak) => {
    const proseMirrorPosition = resolveRichTextPosition(
      editor.state.doc,
      pageBreak.position,
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

function listDomainSegments(doc: ProseMirrorNode) {
  const segments: DomainSegment[] = [];

  for (
    let paragraphIndex = 0;
    paragraphIndex < doc.childCount;
    paragraphIndex += 1
  ) {
    const paragraph = doc.child(paragraphIndex);
    const paragraphStart = getParagraphStart(doc, paragraphIndex);
    let nodeStart = paragraphStart;

    if (paragraph.childCount === 0 && paragraphIndex < doc.childCount - 1) {
      segments.push({
        from: { paragraphIndex, nodeIndex: 0, offset: 0 },
        to: { paragraphIndex: paragraphIndex + 1, nodeIndex: 0, offset: 0 },
        proseMirror: paragraphStart,
      });
      continue;
    }

    for (let nodeIndex = 0; nodeIndex < paragraph.childCount; nodeIndex += 1) {
      const node = paragraph.child(nodeIndex);
      const nodeSize = node.isText ? node.text?.length ?? 0 : 1;

      for (let offset = 0; offset < nodeSize; offset += 1) {
        segments.push({
          from: { paragraphIndex, nodeIndex, offset },
          to: { paragraphIndex, nodeIndex, offset: offset + 1 },
          proseMirror: nodeStart + offset,
        });
      }

      nodeStart += node.nodeSize;
    }
  }

  return segments;
}

export function measureTiptapRichTextLines(
  editor: Editor,
): MeasuredRichTextLine[] | undefined {
  const segments = listDomainSegments(editor.state.doc);

  if (segments.length === 0) {
    return [];
  }

  try {
    const measured = segments.map((segment) => ({
      ...segment,
      rect: editor.view.coordsAtPos(segment.proseMirror, 1),
    }));
    const lines: MeasuredRichTextLine[] = [];
    let lineStart = measured[0]!;
    let lineEnd = lineStart.to;
    let lineBottom = lineStart.rect.bottom;

    for (let index = 1; index < measured.length; index += 1) {
      const current = measured[index]!;

      if (Math.abs(current.rect.top - lineStart.rect.top) > 1) {
        lines.push({
          from: lineStart.from,
          to: lineEnd,
          height: Math.max(1, Math.ceil(lineBottom - lineStart.rect.top)),
        });
        lineStart = current;
        lineEnd = current.to;
        lineBottom = current.rect.bottom;
      } else {
        lineEnd = current.to;
        lineBottom = Math.max(lineBottom, current.rect.bottom);
      }
    }

    lines.push({
      from: lineStart.from,
      to: lineEnd,
      height: Math.max(1, Math.ceil(lineBottom - lineStart.rect.top)),
    });

    return lines;
  } catch {
    return undefined;
  }
}
