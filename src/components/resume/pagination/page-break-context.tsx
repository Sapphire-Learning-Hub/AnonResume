"use client";

import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  ResumePageBreak,
  ResumePageBreakMap,
} from "@/domain/resume/page-flow/break-map";

import type { TiptapPageBreak } from "./tiptap-page-breaks";

interface ResumePageBreakAnchor {
  sectionId: string;
  path: string[];
}

interface ResolvedResumePageBreaks {
  structural: ResumePageBreak[];
  text: TiptapPageBreak[];
}

const EMPTY_BREAKS: ResolvedResumePageBreaks = {
  structural: [],
  text: [],
};

const ResumePageBreakContext = createContext<ResumePageBreakMap | undefined>(
  undefined,
);

function pathsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

export function ResumePageBreakProvider({
  breakMap,
  children,
}: {
  breakMap: ResumePageBreakMap;
  children: ReactNode;
}) {
  return (
    <ResumePageBreakContext.Provider value={breakMap}>
      {children}
    </ResumePageBreakContext.Provider>
  );
}

export function useResumePageBreaks(
  anchor: ResumePageBreakAnchor | undefined,
): ResolvedResumePageBreaks {
  const breakMap = useContext(ResumePageBreakContext);

  return useMemo(() => {
    if (!anchor || !breakMap) {
      return EMPTY_BREAKS;
    }

    const matching = breakMap.breaks.filter(
      (pageBreak) =>
        pageBreak.sectionId === anchor.sectionId &&
        pathsEqual(pageBreak.path, anchor.path),
    );

    return {
      structural: matching.filter(
        (pageBreak) => pageBreak.kind === "structural",
      ),
      text: matching.flatMap((pageBreak) =>
        pageBreak.kind === "text" && pageBreak.textPosition
          ? [
              {
                id: pageBreak.id,
                position: pageBreak.textPosition,
                height: pageBreak.spacerHeight,
                pageIndex: pageBreak.toPageIndex,
              },
            ]
          : [],
      ),
    };
  }, [anchor, breakMap]);
}

const spacerStyle: CSSProperties = {
  display: "block",
  width: "100%",
  pointerEvents: "none",
  userSelect: "none",
};

export function ResumeStructuralPageBreaks({
  sectionId,
  path,
}: ResumePageBreakAnchor) {
  const { structural } = useResumePageBreaks({ sectionId, path });

  return structural.map((pageBreak) => (
    <span
      key={pageBreak.id}
      aria-hidden="true"
      data-resume-page-break-id={pageBreak.id}
      data-resume-page-index={pageBreak.toPageIndex}
      style={{ ...spacerStyle, height: pageBreak.spacerHeight }}
    />
  ));
}

export function ResumeInlinePageBreak({
  pageBreak,
}: {
  pageBreak: TiptapPageBreak;
}) {
  return (
    <span
      aria-hidden="true"
      data-resume-page-break-id={pageBreak.id}
      data-resume-page-index={pageBreak.pageIndex}
      style={{ ...spacerStyle, height: pageBreak.height }}
    />
  );
}
