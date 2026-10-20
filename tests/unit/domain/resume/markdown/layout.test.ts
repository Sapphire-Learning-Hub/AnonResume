import { readFileSync } from "node:fs";

import {
  parseResumeMarkdown,
  serializeResumeMarkdown,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type { ResumeDocument } from "@/domain/resume/schema";

function createLayoutDocument(): ResumeDocument {
  const base = createDefaultResumeDocument("zh-CN");
  return {
    ...base,
    meta: { title: "复杂简历", locale: "zh-CN" },
    settings: {
      page: {
        size: "A4",
        margin: { top: 18, right: 16, bottom: 20, left: 14 },
      },
      typography: {
        ...base.settings.typography,
        baseFontSize: 12,
        lineHeight: 1.6,
      },
      theme: { accent: "#1677ff", textColor: "#111827", mutedColor: "#64748b" },
    },
    sections: [
      {
        id: "section-layout",
        title: createRichTextFromPlainText("工作经历"),
        titleStyle: { color: "#1677ff", fontSize: 24 },
        semantic: "experience",
        visible: false,
        layout: {
          columns: 2,
          direction: "horizontal",
          gap: 14,
          padding: { top: 2, right: 4, bottom: 6, left: 8 },
        },
        pagination: { keepTogether: true },
        blocks: [
          {
            id: "styled-text",
            type: "text",
            content: createRichTextFromPlainText("说明"),
            style: {
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.4,
              color: "#334155",
              tone: "muted",
              align: "center",
            },
          },
          {
            id: "styled-list",
            type: "list",
            ordered: false,
            marker: "square",
            gap: 7,
            items: [
              {
                id: "list-item",
                children: [
                  {
                    id: "list-text",
                    type: "text",
                    content: createRichTextFromPlainText("列表"),
                  },
                ],
              },
            ],
          },
          {
            id: "badges",
            type: "badges",
            wrap: false,
            gap: 9,
            items: [
              { id: "badge-1", text: "TypeScript" },
              { id: "badge-2", text: "React" },
            ],
          },
          {
            id: "group",
            type: "group",
            direction: "vertical",
            gap: 10,
            align: "stretch",
            children: [
              {
                id: "row",
                type: "row",
                gap: 16,
                align: "center",
                justify: "between",
                children: [
                  {
                    id: "left",
                    type: "text",
                    content: createRichTextFromPlainText("左侧"),
                  },
                  {
                    id: "right",
                    type: "text",
                    content: createRichTextFromPlainText("右侧"),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("AnonResume Markdown layout dialect", () => {
  it("applies explicit layout edits without dropping other section design settings", () => {
    const document = createLayoutDocument();
    const serialized = serializeResumeMarkdown(document);
    const source = serialized.source
      .replace("## 工作经历", "## 工作经历 {visible=true}")
      .replace(
        ':::layout {columns=2 direction="horizontal" gap=14}',
        ':::layout {columns=2 direction="horizontal" gap=18}',
      )
      .replace(
        "`TypeScript` `React`",
        ":::badges {wrap=true gap=11}\n:tag[TypeScript] :tag[React]\n:::",
      )
      .replace(
        ':::row {gap=16 align="center" justify="between"}',
        ':::row {gap=22 align="end" justify="start"}',
      );
    const result = parseResumeMarkdown({
      source,
      baseDocument: document,
      locale: "zh-CN",
      projection: serialized.projection,
    });
    expect(result.diagnostics).toEqual([]);
    const section = result.document?.sections[0];
    expect(section).toMatchObject({
      visible: true,
      layout: { ...document.sections[0]!.layout, gap: 18 },
    });
    expect(section?.blocks[2]).toMatchObject({
      type: "badges",
      wrap: true,
      gap: 11,
    });
    expect(section?.blocks[3]).toMatchObject({
      type: "group",
      children: [{ type: "row", gap: 22, align: "end", justify: "start" }],
    });
  });
  it("keeps presentation in projection and emits only necessary layout directives", () => {
    const baseDocument = createLayoutDocument();
    const serialized = serializeResumeMarkdown(baseDocument);

    expect(serialized.source).toContain("## 工作经历\n");
    expect(serialized.source).not.toContain("title-color=");
    expect(serialized.source).not.toContain("keep-together=");
    expect(serialized.source).not.toMatch(/:::(?:text|list|item)\b/);
    expect(serialized.source.match(/^:::group/gm)).toHaveLength(1);
    expect(serialized.source).toContain(":::layout");
    expect(serialized.source).toContain(":::row");
    expect(serialized.source).toContain("说明\n\n- 列表");
    const parsed = parseResumeMarkdown({
      source: serialized.source,
      baseDocument,
      locale: "zh-CN",
      projection: serialized.projection,
    });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.document).toEqual(baseDocument);
    expect(serialized.projection.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "styled-text", kind: "text" }),
        expect.objectContaining({ id: "styled-list", kind: "list" }),
        expect.objectContaining({ id: "badges", kind: "badges" }),
        expect.objectContaining({ id: "group", kind: "group" }),
        expect.objectContaining({ id: "row", kind: "row" }),
      ]),
    );
  });

  it("preserves titled row group boundaries with standard Markdown content inside", () => {
    const document = createLayoutDocument();
    document.sections[0]!.blocks = [
      {
        id: "projects-row",
        type: "row",
        gap: 12,
        children: [
          {
            id: "project-a",
            type: "group",
            direction: "vertical",
            children: [
              {
                id: "project-a-title",
                type: "text",
                style: { fontSize: 17, fontWeight: 700 },
                content: createRichTextFromPlainText("项目 A"),
              },
              {
                id: "project-a-list",
                type: "list",
                items: [
                  {
                    id: "project-a-item",
                    children: [
                      {
                        id: "project-a-text",
                        type: "text",
                        content: createRichTextFromPlainText("负责核心模块"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "project-b",
            type: "group",
            direction: "vertical",
            children: [
              {
                id: "project-b-title",
                type: "text",
                style: { fontSize: 17, fontWeight: 700 },
                content: createRichTextFromPlainText("项目 B"),
              },
              {
                id: "project-b-text",
                type: "text",
                content: createRichTextFromPlainText("搭建发布流程"),
              },
            ],
          },
        ],
      },
    ];

    const serialized = serializeResumeMarkdown(document);
    const source = serialized.source;

    expect(source.match(/:::row/g)).toHaveLength(1);
    const parsed = parseResumeMarkdown({
      source,
      baseDocument: document,
      locale: "zh-CN",
      projection: serialized.projection,
    });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.document).toEqual(document);
    expect(source).toContain("### 项目 A\n\n- 负责核心模块");
    expect(source).toContain("### 项目 B\n\n搭建发布流程");
    expect(source).not.toMatch(/:::(?:text|list|item)\b/);
  });

  it("parses peer headings inside a row as distinct vertical groups", () => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument)
      .source.replace("anonresume: 2", "anonresume: 1")
      .replace(
        /## 工作经历[^\n]*\n[^]*$/,
        [
          "## 工作经历",
          "",
          ":::row {gap=12}",
          "### 项目 A",
          "",
          "- 负责核心模块",
          "",
          "### 项目 B",
          "",
          "搭建发布流程",
          ":::",
        ].join("\n"),
      );

    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks[0]).toMatchObject({
      type: "row",
      gap: 12,
      children: [
        {
          type: "group",
          direction: "vertical",
          children: [{ type: "text" }, { type: "list" }],
        },
        {
          type: "group",
          direction: "vertical",
          children: [{ type: "text" }, { type: "text" }],
        },
      ],
    });
  });

  it("uses one nested group when a compound row child has no heading boundary", () => {
    const document = createLayoutDocument();
    document.sections[0]!.blocks = [
      {
        id: "projects-row",
        type: "row",
        children: [
          {
            id: "untitled-project",
            type: "group",
            direction: "vertical",
            gap: 8,
            children: [
              {
                id: "project-summary",
                type: "text",
                content: createRichTextFromPlainText("项目概述"),
              },
              {
                id: "project-detail",
                type: "text",
                content: createRichTextFromPlainText("项目详情"),
              },
            ],
          },
        ],
      },
    ];

    const source = serializeResumeMarkdown(document).source;

    expect(source.match(/:::row/g)).toHaveLength(1);
    expect(source.match(/:::group/g)).toHaveLength(1);
    expect(source).toContain("项目概述\n\n项目详情");
    expect(source).not.toContain(":::text");
  });

  it("serializes nested list content with standard indentation", () => {
    const document = createLayoutDocument();
    document.sections[0]!.blocks = [
      {
        id: "nested-list",
        type: "list",
        items: [
          {
            id: "parent-item",
            children: [
              {
                id: "parent-text",
                type: "text",
                content: createRichTextFromPlainText("父项"),
              },
              {
                id: "child-list",
                type: "list",
                items: [
                  {
                    id: "child-item",
                    children: [
                      {
                        id: "child-text",
                        type: "text",
                        content: createRichTextFromPlainText("子项"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(serializeResumeMarkdown(document).source).toContain(
      "- 父项\n  - 子项",
    );
  });

  it("parses nested standard lists as child blocks of the parent item", () => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 工作经历[^\n]*\n[^]*$/,
      "## 工作经历\n\n- 父项\n  - 子项\n",
    );

    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });
    const block = parsed.document?.sections[0]?.blocks[0];

    expect(parsed.hasErrors).toBe(false);
    expect(block).toMatchObject({
      type: "list",
      items: [
        {
          children: [
            { type: "text", content: createRichTextFromPlainText("父项") },
            {
              type: "list",
              items: [
                {
                  children: [
                    {
                      type: "text",
                      content: createRichTextFromPlainText("子项"),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("does not infer badges from an ordinary Markdown list without projection", () => {
    const baseDocument = createLayoutDocument();
    baseDocument.sections[0]!.blocks = [
      {
        id: "existing-badges",
        type: "badges",
        wrap: true,
        items: [{ id: "badge-old", text: "旧标签" }],
      },
    ];
    const parsed = parseResumeMarkdown({
      source: "## 技能\n\n- TypeScript\n- React\n",
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks[0]).toMatchObject({
      type: "list",
      items: [
        { children: [{ type: "text" }] },
        { children: [{ type: "text" }] },
      ],
    });
  });

  it("maps adjacent Mujicv left/right containers to a row", () => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 工作经历[^\n]*\n[^]*$/,
      [
        "## 工作经历 {visible=true}",
        "",
        ":::left",
        "### 工程师",
        ":::",
        "",
        ":::right",
        "2024.01 - 至今",
        ":::",
      ].join("\n"),
    );
    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(parsed.document?.sections[0]?.blocks[0]).toMatchObject({
      type: "row",
      justify: "between",
      children: [
        { type: "group", align: "start" },
        { type: "group", align: "end" },
      ],
    });
  });

  it("parses the complex fixture and produces a stable canonical round trip", () => {
    const source = readFileSync(
      `${process.cwd()}/tests/fixtures/resume/markdown/complex-resume.md`,
      "utf8",
    );
    const baseDocument = createLayoutDocument();
    const first = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(first.hasErrors).toBe(false);
    const canonical = serializeResumeMarkdown(first.document!).source;
    const second = parseResumeMarkdown({
      source: canonical,
      baseDocument: first.document!,
      locale: "zh-CN",
    });
    expect(second.hasErrors).toBe(false);
    expect(serializeResumeMarkdown(second.document!).source).toBe(canonical);
  });

  it.each([
    ["unknown block", ":::unknown\nvalue\n:::", "block_unknown_directive"],
    [
      "unclosed block",
      ":::group {direction=vertical}\nvalue",
      "block_unclosed_directive",
    ],
    [
      "invalid attributes",
      ":::row {gap=-1}\nvalue\n:::",
      "block_invalid_attribute",
    ],
  ])("rejects %s", (_name, block, code) => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 工作经历[^\n]*\n[^]*$/,
      `## 工作经历 {visible=true}\n\n${block}`,
    );
    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(true);
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, severity: "error" }),
      ]),
    );
  });
});
