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
      page: { size: "A4", margin: { top: 18, right: 16, bottom: 20, left: 14 } },
      typography: { ...base.settings.typography, baseFontSize: 12, lineHeight: 1.6 },
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
                  { id: "list-text", type: "text", content: createRichTextFromPlainText("列表") },
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
                  { id: "left", type: "text", content: createRichTextFromPlainText("左侧") },
                  { id: "right", type: "text", content: createRichTextFromPlainText("右侧") },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, item]) => [key, withoutIds(item)]),
  );
}

describe("AnonResume Markdown layout dialect", () => {
  it("round-trips section, text, list, badge, group, and row settings", () => {
    const baseDocument = createLayoutDocument();
    const serialized = serializeResumeMarkdown(baseDocument);

    expect(serialized.source).toContain('title-color="#1677ff"');
    expect(serialized.source).toContain("keep-together=true");
    expect(serialized.source).toContain(":::text");
    expect(serialized.source).toContain(":::list");
    expect(serialized.source).toContain(":::badges");
    expect(serialized.source).toContain(":::group");
    expect(serialized.source).toContain(":::row");

    const parsed = parseResumeMarkdown({
      source: serialized.source,
      baseDocument,
      locale: "zh-CN",
    });

    expect(parsed.hasErrors).toBe(false);
    expect(withoutIds(parsed.document?.sections)).toEqual(
      withoutIds(baseDocument.sections),
    );
  });

  it("maps adjacent Mujicv left/right containers to a row", () => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 工作经历[^\n]*\n[^]*$/,
      [
        '## 工作经历 {visible=true}',
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
    const parsed = parseResumeMarkdown({ source, baseDocument, locale: "zh-CN" });

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
    const first = parseResumeMarkdown({ source, baseDocument, locale: "zh-CN" });

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
    ["unclosed block", ":::group {direction=vertical}\nvalue", "block_unclosed_directive"],
    ["invalid attributes", ":::row {gap=-1}\nvalue\n:::", "block_invalid_attribute"],
  ])("rejects %s", (_name, block, code) => {
    const baseDocument = createLayoutDocument();
    const source = serializeResumeMarkdown(baseDocument).source.replace(
      /## 工作经历[^\n]*\n[^]*$/,
      `## 工作经历 {visible=true}\n\n${block}`,
    );
    const parsed = parseResumeMarkdown({ source, baseDocument, locale: "zh-CN" });

    expect(parsed.hasErrors).toBe(true);
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, severity: "error" })]),
    );
  });
});
