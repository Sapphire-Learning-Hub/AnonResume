import {
  createResumeDiffPresentation,
  createResumeDiffTextSegments,
} from "@/components/resume/resume-diff-presentation";
import type { ResumeDocumentDiffResult } from "@/domain/resume/document-diff";

function createResult(): ResumeDocumentDiffResult {
  return {
    changes: [
      {
        id: "content:removed:badge-bun:node",
        category: "content",
        kind: "removed",
        nodeId: "badge-bun",
        nodeType: "badge",
        label: "Bun",
        field: "node",
        cloudValue: "Bun",
      },
      {
        id: "content:added:badge-typescript:node",
        category: "content",
        kind: "added",
        nodeId: "badge-typescript",
        nodeType: "badge",
        label: "TypeScript",
        field: "node",
        localValue: "TypeScript",
      },
      {
        id: "content:changed:block-summary:text",
        category: "content",
        kind: "changed",
        nodeId: "block-summary",
        nodeType: "block",
        label: "Principal 全栈工程师",
        field: "text",
        cloudValue: "Senior 前端工程师",
        localValue: "Principal 全栈工程师",
      },
      {
        id: "content:moved:section-profile:order",
        category: "content",
        kind: "moved",
        nodeId: "section-profile",
        nodeType: "section",
        label: "个人简介",
        field: "order",
        cloudValue: "1",
        localValue: "2",
      },
      {
        id: "appearance:changed:document:typography.lineHeight",
        category: "appearance",
        kind: "changed",
        nodeId: "document",
        nodeType: "document",
        label: "简历",
        field: "typography.lineHeight",
        cloudValue: "1.45",
        localValue: "1.6",
      },
    ],
    summary: {
      total: 5,
      content: 4,
      appearance: 1,
      added: 1,
      removed: 1,
      changed: 2,
      moved: 1,
    },
  };
}

describe("resume diff presentation", () => {
  it("assigns changes to the renderer sides where their nodes exist", () => {
    const presentation = createResumeDiffPresentation(createResult());

    expect(
      presentation.sourceAnnotations.get("badge:badge-bun:node")?.[0],
    ).toMatchObject({
      kind: "removed",
      side: "source",
      valueLabel: "Bun",
    });
    expect(
      presentation.targetAnnotations.get("badge:badge-typescript:node")?.[0],
    ).toMatchObject({
      kind: "added",
      side: "target",
      valueLabel: "TypeScript",
    });
    expect(
      presentation.sourceAnnotations.get("section:section-profile:order")?.[0],
    ).toMatchObject({
      kind: "moved",
      side: "source",
      valueLabel: "1",
    });
    expect(
      presentation.targetAnnotations.get("section:section-profile:order")?.[0],
    ).toMatchObject({
      kind: "moved",
      side: "target",
      valueLabel: "2",
    });
    expect(presentation.pageSettings).toEqual([
      expect.objectContaining({
        field: "typography.lineHeight",
        sourceValue: "1.45",
        targetValue: "1.6",
      }),
    ]);
    expect(presentation.orderedChangeIds).toEqual(
      createResult().changes.map((change) => change.id),
    );
  });

  it("marks only changed Latin and Chinese words while preserving text", () => {
    const segments = createResumeDiffTextSegments(
      "Senior 前端工程师",
      "Principal 全栈工程师",
    );

    expect(segments.source.map((segment) => segment.value).join("")).toBe(
      "Senior 前端工程师",
    );
    expect(segments.target.map((segment) => segment.value).join("")).toBe(
      "Principal 全栈工程师",
    );
    expect(
      segments.source.filter((segment) => segment.changed).map((segment) => segment.value),
    ).toEqual(["Senior", "前端"]);
    expect(
      segments.target.filter((segment) => segment.changed).map((segment) => segment.value),
    ).toEqual(["Principal", "全栈"]);
    expect(
      segments.source.filter((segment) => !segment.changed).map((segment) => segment.value),
    ).toContain("工程师");
  });

  it("falls back to whole-value highlighting for unusually large comparisons", () => {
    const source = "a ".repeat(230);
    const target = "b ".repeat(230);

    expect(createResumeDiffTextSegments(source, target)).toEqual({
      source: [{ value: source, changed: true }],
      target: [{ value: target, changed: true }],
    });
  });
});
