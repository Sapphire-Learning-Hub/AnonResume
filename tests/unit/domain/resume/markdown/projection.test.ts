import {
  createResumeMarkdownProjection,
  decodeResumeMarkdownProjection,
  RESUME_MARKDOWN_PROJECTION_VERSION,
  RESUME_MARKDOWN_SOURCE_VERSION,
} from "@/domain/resume/markdown";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeMarkdownSourceMap } from "@/domain/resume/markdown";

function createDocument(): ResumeDocument {
  return {
    schemaVersion: 1,
    meta: { title: "投影测试", locale: "zh-CN" },
    settings: {
      page: {
        size: "A4",
        margin: { top: 24, right: 24, bottom: 24, left: 24 },
      },
      typography: {
        fontFamily: "sans-serif",
        baseFontSize: 14,
        lineHeight: 1.5,
      },
      theme: {
        accent: "#1677ff",
        textColor: "#111827",
        mutedColor: "#64748b",
      },
    },
    sections: [
      {
        id: "section-skills",
        title: createRichTextFromPlainText("技能"),
        visible: true,
        blocks: [
          {
            id: "row-projects",
            type: "row",
            children: [
              {
                id: "group-project-a",
                type: "group",
                direction: "vertical",
                children: [
                  {
                    id: "text-project-a",
                    type: "text",
                    content: createRichTextFromPlainText("项目 A"),
                  },
                ],
              },
            ],
          },
          {
            id: "list-skills",
            type: "list",
            items: [
              {
                id: "item-typescript",
                children: [
                  {
                    id: "text-typescript",
                    type: "text",
                    content: createRichTextFromPlainText("TypeScript"),
                  },
                ],
              },
            ],
          },
          {
            id: "badges-tools",
            type: "badges",
            wrap: true,
            items: [{ id: "badge-bun", text: "Bun" }],
          },
        ],
      },
    ],
  };
}

function createSourceMap(): ResumeMarkdownSourceMap {
  const range = (line: number) => ({
    start: { line, column: 1 },
    end: { line, column: 10 },
  });
  return {
    document: {
      start: { line: 1, column: 1 },
      end: { line: 14, column: 1 },
    },
    sections: [
      {
        id: "section-skills",
        kind: "section",
        path: [0],
        ordinal: 0,
        fingerprint: "section:skills",
        ...range(3),
      },
    ],
    blocks: [
      {
        id: "row-projects",
        kind: "row",
        path: [0, 0],
        parentId: "section-skills",
        ordinal: 0,
        fingerprint: "row:projects",
        ...range(5),
      },
      {
        id: "group-project-a",
        kind: "group",
        path: [0, 0, 0],
        parentId: "row-projects",
        ordinal: 0,
        fingerprint: "group:project-a",
        ...range(6),
      },
      {
        id: "text-project-a",
        kind: "text",
        path: [0, 0, 0, 0],
        parentId: "group-project-a",
        ordinal: 0,
        fingerprint: "text:project-a",
        ...range(7),
      },
      {
        id: "text-project-a:inline:0",
        kind: "inline-span",
        path: [0, 0, 0, 0],
        parentId: "text-project-a",
        ordinal: 0,
        fingerprint: "inline:项目 A",
        inlineSpan: {
          richTextPath: [0, 0],
          start: 0,
          end: 2,
          contextFingerprint: "项目 A",
          mark: "tag",
        },
        ...range(7),
      },
      {
        id: "list-skills",
        kind: "list",
        path: [0, 1],
        parentId: "section-skills",
        ordinal: 1,
        fingerprint: "list:skills",
        ...range(9),
      },
      {
        id: "item-typescript",
        kind: "list-item",
        path: [0, 1, 0],
        parentId: "list-skills",
        ordinal: 0,
        fingerprint: "item:typescript",
        ...range(9),
      },
      {
        id: "text-typescript",
        kind: "text",
        path: [0, 1, 0, 0],
        parentId: "item-typescript",
        ordinal: 0,
        fingerprint: "text:typescript",
        ...range(9),
      },
      {
        id: "badges-tools",
        kind: "badges",
        path: [0, 2],
        parentId: "section-skills",
        ordinal: 2,
        fingerprint: "badges:tools",
        ...range(11),
      },
      {
        id: "badge-bun",
        kind: "badge",
        path: [0, 2, 0],
        parentId: "badges-tools",
        ordinal: 0,
        fingerprint: "badge:bun",
        ...range(12),
      },
    ],
  };
}

describe("resume Markdown projection contracts", () => {
  it("creates a deterministic versioned projection from nested source entries", () => {
    const projection = createResumeMarkdownProjection(
      createDocument(),
      createSourceMap(),
      17,
    );

    expect(RESUME_MARKDOWN_SOURCE_VERSION).toBe(1);
    expect(RESUME_MARKDOWN_PROJECTION_VERSION).toBe(1);
    expect(projection).toMatchObject({
      version: 1,
      baseDocumentVersion: 17,
      sections: [
        {
          id: "section-skills",
          kind: "section",
          path: [0],
          ordinal: 0,
          fingerprint: "section:skills",
        },
      ],
    });
    expect(projection.nodes.map(({ id, kind, path, parentId, ordinal }) => ({
      id,
      kind,
      path,
      parentId,
      ordinal,
    }))).toEqual([
      {
        id: "row-projects",
        kind: "row",
        path: [0, 0],
        parentId: "section-skills",
        ordinal: 0,
      },
      {
        id: "group-project-a",
        kind: "group",
        path: [0, 0, 0],
        parentId: "row-projects",
        ordinal: 0,
      },
      {
        id: "text-project-a",
        kind: "text",
        path: [0, 0, 0, 0],
        parentId: "group-project-a",
        ordinal: 0,
      },
      {
        id: "text-project-a:inline:0",
        kind: "inline-span",
        path: [0, 0, 0, 0],
        parentId: "text-project-a",
        ordinal: 0,
      },
      {
        id: "list-skills",
        kind: "list",
        path: [0, 1],
        parentId: "section-skills",
        ordinal: 1,
      },
      {
        id: "item-typescript",
        kind: "list-item",
        path: [0, 1, 0],
        parentId: "list-skills",
        ordinal: 0,
      },
      {
        id: "text-typescript",
        kind: "text",
        path: [0, 1, 0, 0],
        parentId: "item-typescript",
        ordinal: 0,
      },
      {
        id: "badges-tools",
        kind: "badges",
        path: [0, 2],
        parentId: "section-skills",
        ordinal: 2,
      },
      {
        id: "badge-bun",
        kind: "badge",
        path: [0, 2, 0],
        parentId: "badges-tools",
        ordinal: 0,
      },
    ]);
    expect(projection.nodes[3]).toMatchObject({
      inlineSpan: {
        richTextPath: [0, 0],
        start: 0,
        end: 2,
        contextFingerprint: "项目 A",
        mark: "tag",
      },
    });
  });

  it("decodes only the supported projection version", () => {
    const projection = createResumeMarkdownProjection(
      createDocument(),
      createSourceMap(),
      17,
    );

    expect(decodeResumeMarkdownProjection(projection)).toEqual(projection);
    expect(
      decodeResumeMarkdownProjection({ ...projection, version: 2 }),
    ).toBeUndefined();
    expect(decodeResumeMarkdownProjection({ version: 1 })).toBeUndefined();
  });
});
