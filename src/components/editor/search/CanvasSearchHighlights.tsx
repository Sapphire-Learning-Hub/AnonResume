"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeSearchMatch } from "@/domain/resume/search/types";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { TiptapTextBlockEditorHandle } from "@/components/resume/TiptapTextBlockEditor";
import { resolveCanvasSearchRanges } from "./canvas-ranges";
import { useCanvasSearchHighlightStyles } from "./CanvasSearchHighlights.style";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  current: boolean;
}

export function CanvasSearchHighlights({
  viewportRef,
  document,
  matches,
  currentKey,
  selection,
  editorRef,
  navigationRequest,
  paginationReady,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  document: ResumeDocument;
  matches: ResumeSearchMatch[];
  currentKey?: string;
  selection: ResumeEditorSelection;
  editorRef: RefObject<TiptapTextBlockEditorHandle | null>;
  navigationRequest: number;
  paginationReady: boolean;
}) {
  const { styles } = useCanvasSearchHighlightStyles();
  const layerRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const layer = layerRef.current;
    if (!viewport || !layer || !paginationReady) return;
    let frame = 0;
    let shouldNavigate = true;
    const rangeCache = new Map<string, Range[]>();
    const getRanges = (match: ResumeSearchMatch) => {
      const selected =
        selection.sectionId === match.sectionId &&
        (match.field === "title"
          ? selection.richTextField === "title"
          : match.field === "content" &&
            selection.richTextField !== "title" &&
            JSON.stringify(selection.blockPath) ===
              JSON.stringify(match.blockPath));
      const cached = rangeCache.get(match.key);
      if (cached) return cached;
      const ranges =
        selected && editorRef.current
          ? editorRef.current.getSearchRanges(match)
          : resolveCanvasSearchRanges(viewport, document, match);
      rangeCache.set(match.key, ranges);
      return ranges;
    };
    function measure() {
      frame = 0;
      const viewportBox = viewport!.getBoundingClientRect();
      const layerBox = layer!.getBoundingClientRect();
      const current = matches.find((match) => match.key === currentKey);
      if (shouldNavigate && current) {
        const range = getRanges(current)[0];
        const bounds = range?.getClientRects()[0];
        if (
          bounds &&
          viewportBox.height > 0 &&
          (bounds.top < viewportBox.top + 24 ||
            bounds.bottom > viewportBox.bottom - 24)
        ) {
          viewport!.scrollTop +=
            bounds.top - viewportBox.top - viewportBox.height * 0.4;
        }
        if (
          bounds &&
          viewportBox.width > 0 &&
          (bounds.left < viewportBox.left + 16 ||
            bounds.right > viewportBox.right - 16)
        ) {
          viewport!.scrollLeft +=
            bounds.left - viewportBox.left - viewportBox.width * 0.4;
        }
        if (bounds) shouldNavigate = false;
      }
      const next: Box[] = [];
      for (const match of matches) {
        for (const range of getRanges(match)) {
          for (const rect of Array.from(range.getClientRects())) {
            const left = Math.max(rect.left, viewportBox.left);
            const top = Math.max(rect.top, viewportBox.top);
            const right = Math.min(rect.right, viewportBox.right);
            const bottom = Math.min(rect.bottom, viewportBox.bottom);
            if (right > left && bottom > top)
              next.push({
                left: left - layerBox.left,
                top: top - layerBox.top,
                width: right - left,
                height: bottom - top,
                current: match.key === currentKey,
              });
          }
        }
      }
      setBoxes((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const mutation = new MutationObserver(() => {
      rangeCache.clear();
      schedule();
    });
    mutation.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport);
    viewport.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [
    viewportRef,
    document,
    matches,
    currentKey,
    selection,
    editorRef,
    navigationRequest,
    paginationReady,
  ]);
  return (
    <div aria-hidden="true" className={styles.layer} ref={layerRef}>
      {(paginationReady ? boxes : []).map((box, index) => (
        <span
          className={styles.match}
          data-current={box.current}
          key={index}
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        />
      ))}
    </div>
  );
}
