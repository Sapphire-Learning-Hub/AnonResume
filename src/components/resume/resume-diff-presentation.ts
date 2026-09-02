import type {
  ResumeDocumentDiffChange,
  ResumeDocumentDiffKind,
  ResumeDocumentDiffResult,
} from "@/domain/resume/document-diff";

export type ResumeDiffSide = "source" | "target";

export interface ResumeDiffTextSegment {
  value: string;
  changed: boolean;
}

export interface ResumeDiffNodeAnnotation {
  changeId: string;
  targetKey: string;
  nodeId: string;
  nodeType: ResumeDocumentDiffChange["nodeType"];
  field: string;
  kind: ResumeDocumentDiffKind;
  side: ResumeDiffSide;
  markerLabel: string;
  valueLabel?: string;
  textSegments?: ResumeDiffTextSegment[];
}

export interface ResumeDiffPageSetting {
  changeId: string;
  field: string;
  sourceValue?: string;
  targetValue?: string;
}

export interface ResumeDiffPresentation {
  orderedChangeIds: string[];
  sourceAnnotations: ReadonlyMap<string, ResumeDiffNodeAnnotation[]>;
  targetAnnotations: ReadonlyMap<string, ResumeDiffNodeAnnotation[]>;
  pageSettings: ResumeDiffPageSetting[];
  summary: ResumeDocumentDiffResult["summary"];
}

export interface ResumeRendererDiffPresentation {
  side: ResumeDiffSide;
  annotations: ReadonlyMap<string, ResumeDiffNodeAnnotation[]>;
  pageSettings: ResumeDiffPageSetting[];
}

function tokenize(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }

  return value.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|\s+|[^\s]/gu,
  ) ?? [];
}

function appendSegment(
  segments: ResumeDiffTextSegment[],
  value: string,
  changed: boolean,
) {
  const previous = segments.at(-1);

  if (previous?.changed === changed) {
    previous.value += value;
    return;
  }

  segments.push({ value, changed });
}

export function createResumeDiffTextSegments(source: string, target: string) {
  const sourceTokens = tokenize(source);
  const targetTokens = tokenize(target);

  if (sourceTokens.length * targetTokens.length > 50_000) {
    return {
      source: [{ value: source, changed: true }],
      target: [{ value: target, changed: true }],
    };
  }

  const table = Array.from({ length: sourceTokens.length + 1 }, () =>
    new Uint16Array(targetTokens.length + 1),
  );

  for (let sourceIndex = sourceTokens.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = targetTokens.length - 1; targetIndex >= 0; targetIndex -= 1) {
      table[sourceIndex]![targetIndex] =
        sourceTokens[sourceIndex] === targetTokens[targetIndex]
          ? table[sourceIndex + 1]![targetIndex + 1]! + 1
          : Math.max(
              table[sourceIndex + 1]![targetIndex]!,
              table[sourceIndex]![targetIndex + 1]!,
            );
    }
  }

  const sourceSegments: ResumeDiffTextSegment[] = [];
  const targetSegments: ResumeDiffTextSegment[] = [];
  let sourceIndex = 0;
  let targetIndex = 0;

  while (sourceIndex < sourceTokens.length || targetIndex < targetTokens.length) {
    const sourceToken = sourceTokens[sourceIndex];
    const targetToken = targetTokens[targetIndex];

    if (sourceToken !== undefined && sourceToken === targetToken) {
      appendSegment(sourceSegments, sourceToken, false);
      appendSegment(targetSegments, targetToken, false);
      sourceIndex += 1;
      targetIndex += 1;
      continue;
    }

    if (
      targetToken !== undefined &&
      (sourceToken === undefined ||
        table[sourceIndex]![targetIndex + 1]! >=
          table[sourceIndex + 1]![targetIndex]!)
    ) {
      appendSegment(targetSegments, targetToken, true);
      targetIndex += 1;
      continue;
    }

    if (sourceToken !== undefined) {
      appendSegment(sourceSegments, sourceToken, true);
      sourceIndex += 1;
    }
  }

  return { source: sourceSegments, target: targetSegments };
}

export function getResumeDiffTargetKey(change: ResumeDocumentDiffChange) {
  return `${change.nodeType}:${change.nodeId}:${change.field}`;
}

function addAnnotation(
  map: Map<string, ResumeDiffNodeAnnotation[]>,
  annotation: ResumeDiffNodeAnnotation,
) {
  map.set(annotation.targetKey, [
    ...(map.get(annotation.targetKey) ?? []),
    annotation,
  ]);
}

function createAnnotation(
  change: ResumeDocumentDiffChange,
  side: ResumeDiffSide,
  textSegments?: ResumeDiffTextSegment[],
): ResumeDiffNodeAnnotation {
  return {
    changeId: change.id,
    targetKey: getResumeDiffTargetKey(change),
    nodeId: change.nodeId,
    nodeType: change.nodeType,
    field: change.field,
    kind: change.kind,
    side,
    markerLabel: change.kind,
    valueLabel: side === "source" ? change.cloudValue : change.localValue,
    textSegments,
  };
}

function isInlineTextChange(change: ResumeDocumentDiffChange) {
  return (
    change.kind === "changed" &&
    (change.field === "text" || change.field === "title") &&
    change.cloudValue !== undefined &&
    change.localValue !== undefined
  );
}

export function createResumeDiffPresentation(
  result: ResumeDocumentDiffResult,
): ResumeDiffPresentation {
  const sourceAnnotations = new Map<string, ResumeDiffNodeAnnotation[]>();
  const targetAnnotations = new Map<string, ResumeDiffNodeAnnotation[]>();
  const pageSettings: ResumeDiffPageSetting[] = [];

  for (const change of result.changes) {
    if (change.nodeType === "document") {
      pageSettings.push({
        changeId: change.id,
        field: change.field,
        sourceValue: change.cloudValue,
        targetValue: change.localValue,
      });
      continue;
    }

    const textDiff = isInlineTextChange(change)
      ? createResumeDiffTextSegments(change.cloudValue!, change.localValue!)
      : undefined;

    if (change.kind !== "added") {
      addAnnotation(
        sourceAnnotations,
        createAnnotation(change, "source", textDiff?.source),
      );
    }

    if (change.kind !== "removed") {
      addAnnotation(
        targetAnnotations,
        createAnnotation(change, "target", textDiff?.target),
      );
    }
  }

  return {
    orderedChangeIds: result.changes.map((change) => change.id),
    sourceAnnotations,
    targetAnnotations,
    pageSettings,
    summary: result.summary,
  };
}
