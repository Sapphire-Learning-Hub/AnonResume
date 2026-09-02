import type {
  Delete,
  Emphasis,
  Html,
  Image,
  InlineCode,
  Link,
  PhrasingContent,
  Strong,
  Text,
} from "mdast";

import type { RichTextContent } from "../schema";
import { resolveMujicvIconId } from "./mujicv-icons";
import type { ResumeImportDiagnostic } from "./types";

type RichTextNode = RichTextContent["content"][number]["content"][number];
type TextMark = NonNullable<
  Extract<RichTextNode, { type: "text" }>["marks"]
>[number];

function pushText(output: RichTextNode[], text: string, marks: TextMark[]) {
  if (!text) {
    return;
  }

  const previous = output.at(-1);

  if (
    previous?.type === "text" &&
    JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)
  ) {
    previous.text += text;
    return;
  }

  output.push({
    type: "text",
    text,
    ...(marks.length ? { marks: [...marks] } : {}),
  });
}

function convertMujicvIconText({
  diagnostics,
  line,
  marks,
  output,
  value,
}: {
  diagnostics: ResumeImportDiagnostic[];
  line: number;
  marks: TextMark[];
  output: RichTextNode[];
  value: string;
}) {
  const pattern = /\bicon:([a-z0-9-]+)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    pushText(output, value.slice(cursor, match.index), marks);

    const iconName = match[1]!;
    const iconId = resolveMujicvIconId(iconName);

    if (!iconId) {
      pushText(output, match[0], marks);
      diagnostics.push({
        severity: "warning",
        code: "mujicv_unknown_icon",
        message: `Unknown Mujicv icon: ${iconName}.`,
        line,
      });
      cursor = pattern.lastIndex;
      continue;
    }

    output.push({ type: "resumeIcon", attrs: { iconId } });
    cursor = pattern.lastIndex;

    const whitespace = value.slice(cursor).match(/^\s+/)?.[0];

    if (whitespace) {
      pushText(output, " ", []);
      cursor += whitespace.length;
      pattern.lastIndex = cursor;
    }
  }

  pushText(output, value.slice(cursor), marks);
}

function convertInlineNode({
  diagnostics,
  mujicv,
  node,
  output,
  parentMarks,
}: {
  diagnostics: ResumeImportDiagnostic[];
  mujicv: boolean;
  node: PhrasingContent;
  output: RichTextNode[];
  parentMarks: TextMark[];
}) {
  const line = node.position?.start.line ?? 1;

  switch (node.type) {
    case "text": {
      const value = (node as Text).value;

      if (mujicv) {
        convertMujicvIconText({
          diagnostics,
          line,
          marks: parentMarks,
          output,
          value,
        });
      } else {
        pushText(output, value, parentMarks);
      }
      return;
    }
    case "break":
      output.push({ type: "hardBreak" });
      return;
    case "inlineCode":
      pushText(output, (node as InlineCode).value, [
        ...parentMarks,
        { type: "tag" },
      ]);
      return;
    case "strong":
      (node as Strong).children.forEach((child) =>
        convertInlineNode({
          diagnostics,
          mujicv,
          node: child,
          output,
          parentMarks: [...parentMarks, { type: "bold" }],
        }),
      );
      return;
    case "emphasis":
      (node as Emphasis).children.forEach((child) =>
        convertInlineNode({
          diagnostics,
          mujicv,
          node: child,
          output,
          parentMarks: [...parentMarks, { type: "italic" }],
        }),
      );
      return;
    case "delete":
      (node as Delete).children.forEach((child) =>
        convertInlineNode({
          diagnostics,
          mujicv,
          node: child,
          output,
          parentMarks: [...parentMarks, { type: "strike" }],
        }),
      );
      return;
    case "link": {
      const link = node as Link;

      link.children.forEach((child) =>
        convertInlineNode({
          diagnostics,
          mujicv,
          node: child,
          output,
          parentMarks: [
            ...parentMarks,
            { type: "link", attrs: { href: link.url } },
          ],
        }),
      );
      return;
    }
    case "image": {
      const image = node as Image;
      pushText(output, image.alt || image.url, parentMarks);
      return;
    }
    case "html": {
      const html = node as Html;
      pushText(output, html.value, parentMarks);
      diagnostics.push({
        severity: "warning",
        code: "raw_html_preserved_as_text",
        message: "Raw HTML was preserved as editable text.",
        line,
      });
      return;
    }
    default:
      return;
  }
}

export function createRichTextFromMdast(
  children: PhrasingContent[],
  options: {
    diagnostics: ResumeImportDiagnostic[];
    mujicv: boolean;
  },
): RichTextContent {
  const content: RichTextNode[] = [];

  children.forEach((node) =>
    convertInlineNode({
      diagnostics: options.diagnostics,
      mujicv: options.mujicv,
      node,
      output: content,
      parentMarks: [],
    }),
  );

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: content.length ? content : [{ type: "text", text: " " }],
      },
    ],
  };
}
