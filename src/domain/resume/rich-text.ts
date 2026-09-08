import type { RichTextContent } from "./schema";
import { richTextContentSchema } from "./schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeLinkHref(value: unknown): string | undefined {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  return trimmedValue || undefined;
}

export function normalizeTextColor(value: unknown): string | undefined {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedValue)
    ? trimmedValue
    : undefined;
}

function sanitizeRuntimeRichTextContent(content: unknown): unknown {
  if (!isRecord(content) || !Array.isArray(content.content)) {
    return content;
  }

  return {
    ...content,
    content: content.content.map((paragraph) => {
      if (!isRecord(paragraph) || !Array.isArray(paragraph.content)) {
        return paragraph;
      }

      return {
        ...paragraph,
        content: paragraph.content.map((node) => {
          if (!isRecord(node) || !Array.isArray(node.marks)) {
            return node;
          }

          return {
            ...node,
            marks: node.marks.flatMap((mark) => {
              if (!isRecord(mark)) {
                return [mark];
              }

              if (mark.type === "textColor") {
                const color = normalizeTextColor(
                  isRecord(mark.attrs) ? mark.attrs.color : undefined,
                );

                return color
                  ? [{ type: "textColor", attrs: { color } }]
                  : [];
              }

              if (mark.type !== "link") {
                return [mark];
              }

              const href = normalizeLinkHref(
                isRecord(mark.attrs) ? mark.attrs.href : undefined,
              );

              return href
                ? [
                    {
                      ...mark,
                      attrs: {
                        ...(isRecord(mark.attrs) ? mark.attrs : {}),
                        href,
                      },
                    },
                  ]
                : [];
            }),
          };
        }),
      };
    }),
  };
}

export function normalizeRichTextContent(content: unknown): RichTextContent {
  const parsed = richTextContentSchema.parse(
    sanitizeRuntimeRichTextContent(content),
  );

  return {
    ...parsed,
    content: parsed.content.map((paragraph) => ({
      ...paragraph,
      content: paragraph.content.map((node) => {
        if (node.type === "hardBreak") {
          return node;
        }

        if (node.type === "resumeIcon") {
          return {
            type: "resumeIcon" as const,
            attrs: {
              iconId: node.attrs.iconId,
            },
          };
        }

        return {
          ...node,
          marks: node.marks?.map((mark) => {
            if (mark.type === "textColor") {
              return {
                type: "textColor",
                attrs: { color: mark.attrs.color },
              };
            }

            if (mark.type !== "link") {
              return { type: mark.type };
            }

            return mark.attrs?.href
              ? { type: "link", attrs: { href: mark.attrs.href } }
              : { type: "link" };
          }),
        };
      }),
    })),
  };
}

export function removeInlineTextColorMarks(
  content: RichTextContent,
): RichTextContent {
  return {
    ...content,
    content: content.content.map((paragraph) => ({
      ...paragraph,
      content: paragraph.content.map((node) => {
        if (node.type !== "text" || !node.marks?.length) {
          return node;
        }

        const marks = node.marks.filter((mark) => mark.type !== "textColor");

        if (!marks.length) {
          return { type: "text" as const, text: node.text };
        }

        return { ...node, marks };
      }),
    })),
  };
}

export function areRichTextContentsEqual(
  left: RichTextContent,
  right: RichTextContent,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
