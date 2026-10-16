import { getPlainTextFromRichText } from "../operations";
import { getResumeFontPresetByFamily } from "../font-presets";
import type {
  ResumeBlock,
  ResumeDocument,
  RichTextContent,
} from "../schema";
import { serializeResumeMarkdownFrontMatter } from "./frontmatter";
import type {
  ResumeMarkdownDiagnostic,
  ResumeMarkdownSerializeResult,
  ResumeMarkdownSourceMap,
} from "./types";

type RichTextNode = RichTextContent["content"][number]["content"][number];

function escapeMarkdown(text: string) {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function serializeTextNode(node: RichTextNode) {
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "resumeIcon") return `icon:${node.attrs.iconId}`;

  let output = escapeMarkdown(node.text);
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        output = `**${output}**`;
        break;
      case "italic":
        output = `*${output}*`;
        break;
      case "strike":
        output = `~~${output}~~`;
        break;
      case "code":
      case "tag":
        output = `\`${output}\``;
        break;
      case "link":
        output = `[${output}](${mark.attrs?.href ?? ""})`;
        break;
      case "underline":
      case "textColor":
        break;
    }
  }
  return output;
}

function serializeRichText(content: RichTextContent) {
  return content.content
    .map((paragraph) => paragraph.content.map(serializeTextNode).join(""))
    .join("\n\n");
}

function indent(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${prefix}${line}`))
    .join("\n");
}

function serializeBlock(
  block: ResumeBlock,
  diagnostics: ResumeMarkdownDiagnostic[],
): string {
  switch (block.type) {
    case "text": {
      const content = serializeRichText(block.content);
      if ((block.style?.fontWeight ?? 0) >= 600 && (block.style?.fontSize ?? 0) >= 16) {
        return `### ${content}`;
      }
      return content;
    }
    case "list":
      return block.items
        .map((item, index) => {
          const marker = block.ordered ? `${index + 1}.` : "-";
          const content = item.children
            .map((child) => serializeBlock(child, diagnostics))
            .filter(Boolean)
            .join("\n\n");
          return `${marker} ${indent(content, "   ")}`;
        })
        .join("\n");
    case "badges":
      diagnostics.push({
        severity: "warning",
        code: "block_requires_extended_syntax",
        parameters: { type: block.type },
        line: 1,
        column: 1,
      });
      return block.items.map((item) => `\`${escapeMarkdown(item.text)}\``).join(" ");
    case "group":
    case "row":
      diagnostics.push({
        severity: "warning",
        code: "block_requires_extended_syntax",
        parameters: { type: block.type },
        line: 1,
        column: 1,
      });
      return block.children
        .map((child) => serializeBlock(child, diagnostics))
        .filter(Boolean)
        .join("\n\n");
  }
}

export function serializeResumeMarkdown(
  document: ResumeDocument,
): ResumeMarkdownSerializeResult {
  const diagnostics: ResumeMarkdownDiagnostic[] = [];
  const frontMatter = serializeResumeMarkdownFrontMatter({
    version: 1,
    title: document.meta.title,
    ...(document.meta.locale ? { locale: document.meta.locale } : {}),
    pageMargin: document.settings.page.margin,
    fontFamily:
      getResumeFontPresetByFamily(document.settings.typography.fontFamily)?.name ??
      document.settings.typography.fontFamily,
    fontSize: document.settings.typography.baseFontSize,
    lineHeight: document.settings.typography.lineHeight,
    accent: document.settings.theme.accent,
    textColor: document.settings.theme.textColor,
    mutedColor: document.settings.theme.mutedColor,
  });
  const lines = frontMatter.split("\n");
  const sourceMap: ResumeMarkdownSourceMap = {
    document: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    sections: [],
    blocks: [],
  };

  for (const section of document.sections) {
    lines.push("");
    const sectionStart = lines.length + 1;
    const title = section.title
      ? getPlainTextFromRichText(section.title)
      : "Section";
    const attributes = [
      ...(section.semantic ? [`semantic=${JSON.stringify(section.semantic)}`] : []),
      `visible=${section.visible}`,
    ];
    lines.push(`## ${title} {${attributes.join(" ")}}`);
    sourceMap.sections.push({
      id: section.id,
      start: { line: sectionStart, column: 1 },
      end: { line: sectionStart, column: lines.at(-1)!.length + 1 },
    });

    for (const block of section.blocks) {
      const serialized = serializeBlock(block, diagnostics);
      if (!serialized) continue;
      lines.push("");
      const startLine = lines.length + 1;
      lines.push(...serialized.split("\n"));
      sourceMap.blocks.push({
        id: block.id,
        start: { line: startLine, column: 1 },
        end: { line: lines.length, column: lines.at(-1)!.length + 1 },
      });
    }
  }

  const source = `${lines.join("\n").trimEnd()}\n`;
  const finalLines = source.split("\n");
  sourceMap.document.end = {
    line: finalLines.length,
    column: (finalLines.at(-1)?.length ?? 0) + 1,
  };
  return { source, diagnostics, sourceMap };
}
