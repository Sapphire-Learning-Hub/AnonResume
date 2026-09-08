import { z } from "zod";

import type { ResumeImportMetadata } from "./import/types";

const richTextMarkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["bold", "italic", "underline", "strike", "code", "tag"]),
  }),
  z.object({
    type: z.literal("link"),
    attrs: z
      .object({
        href: z.string().min(1).optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("textColor"),
    attrs: z.object({
      color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    }),
  }),
]);

const richTextTextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(richTextMarkSchema).optional(),
});

const richTextHardBreakNodeSchema = z.object({
  type: z.literal("hardBreak"),
});

const richTextResumeIconNodeSchema = z.object({
  type: z.literal("resumeIcon"),
  attrs: z.object({
    iconId: z.string().min(1),
  }),
});

const richTextParagraphSchema = z.object({
  type: z.literal("paragraph"),
  content: z
    .array(
      z.union([
        richTextTextNodeSchema,
        richTextHardBreakNodeSchema,
        richTextResumeIconNodeSchema,
      ]),
    )
    .default([]),
});

export const richTextContentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(richTextParagraphSchema).min(1),
});

const insetsSchema = z.object({
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
  left: z.number().nonnegative(),
});

const textBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  content: richTextContentSchema,
  style: z
    .object({
      fontSize: z.number().positive().optional(),
      fontWeight: z.number().positive().optional(),
      lineHeight: z.number().positive().optional(),
      color: z.string().min(1).optional(),
      align: z.enum(["left", "center", "right"]).optional(),
    })
    .optional(),
});

export interface ResumeListItem {
  id: string;
  children: ResumeBlock[];
}

function createLegacyListItemTextBlockId(itemId: string) {
  return `${itemId}-text`;
}

const normalizedListItemSchema: z.ZodType<ResumeListItem> = z.object({
  id: z.string().min(1),
  children: z.array(z.lazy(() => resumeBlockSchema)).min(1),
});

const legacyListItemSchema = z
  .object({
    id: z.string().min(1),
    content: richTextContentSchema,
  })
  .transform<ResumeListItem>((item) => ({
    id: item.id,
    children: [
      {
        id: createLegacyListItemTextBlockId(item.id),
        type: "text",
        content: item.content,
      },
    ],
  }));

const listItemSchema: z.ZodType<ResumeListItem> = z.union([
  normalizedListItemSchema,
  legacyListItemSchema,
]);

const listBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("list"),
  ordered: z.boolean().optional(),
  marker: z.enum(["disc", "square", "dash", "none"]).optional(),
  gap: z.number().nonnegative().optional(),
  items: z.array(listItemSchema).min(1),
});

const badgeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("badges"),
  wrap: z.boolean(),
  gap: z.number().nonnegative().optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

const groupBlockSchema: z.ZodType<{
  id: string;
  type: "group";
  direction: "vertical" | "horizontal";
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  children: ResumeBlock[];
}> = z.object({
  id: z.string().min(1),
  type: z.literal("group"),
  direction: z.enum(["vertical", "horizontal"]),
  gap: z.number().nonnegative().optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  children: z.array(
    z.lazy(() =>
      z.union([
        textBlockSchema,
        listBlockSchema,
        badgeBlockSchema,
        groupBlockSchema,
        rowBlockSchema,
      ]),
    ),
  ),
});

const rowBlockSchema: z.ZodType<{
  id: string;
  type: "row";
  gap?: number;
  align?: "start" | "center" | "end";
  justify?: "start" | "between" | "end";
  children: ResumeBlock[];
}> = z.object({
  id: z.string().min(1),
  type: z.literal("row"),
  gap: z.number().nonnegative().optional(),
  align: z.enum(["start", "center", "end"]).optional(),
  justify: z.enum(["start", "between", "end"]).optional(),
  children: z.array(
    z.lazy(() =>
      z.union([
        textBlockSchema,
        listBlockSchema,
        badgeBlockSchema,
        groupBlockSchema,
        rowBlockSchema,
      ]),
    ),
  ),
});

const resumeBlockSchema: z.ZodType<ResumeBlock> = z.lazy(() =>
  z.union([
    textBlockSchema,
    listBlockSchema,
    badgeBlockSchema,
    groupBlockSchema,
    rowBlockSchema,
  ]),
);

export type RichTextContent = z.infer<typeof richTextContentSchema>;

export type TextBlock = z.infer<typeof textBlockSchema>;
export type ListBlock = z.infer<typeof listBlockSchema>;
export type BadgeBlock = z.infer<typeof badgeBlockSchema>;
export type GroupBlock = z.infer<typeof groupBlockSchema>;
export type RowBlock = z.infer<typeof rowBlockSchema>;

export type ResumeBlock =
  | TextBlock
  | ListBlock
  | BadgeBlock
  | GroupBlock
  | RowBlock;

export interface ResumeSection {
  id: string;
  title?: RichTextContent;
  titleStyle?: {
    color?: string;
  };
  semantic?: string;
  visible: boolean;
  layout?: {
    columns?: number;
    direction?: "vertical" | "horizontal";
    gap?: number;
    padding?: z.infer<typeof insetsSchema>;
  };
  pagination?: {
    keepTogether?: boolean;
  };
  blocks: ResumeBlock[];
}

export interface ResumeDocument {
  schemaVersion: number;
  meta: {
    title: string;
    locale?: string;
    import?: ResumeImportMetadata;
  };
  settings: {
    page: {
      size: "A4";
      margin: z.infer<typeof insetsSchema>;
    };
    typography: {
      fontFamily: string;
      baseFontSize: number;
      lineHeight: number;
    };
    theme: {
      accent: string;
      textColor: string;
      mutedColor: string;
    };
  };
  sections: ResumeSection[];
}

const resumeSectionSchema: z.ZodType<ResumeSection> = z.object({
  id: z.string().min(1),
  title: richTextContentSchema.optional(),
  titleStyle: z
    .object({
      color: z
        .string()
        .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
        .optional(),
    })
    .optional(),
  semantic: z.string().min(1).optional(),
  visible: z.boolean(),
  layout: z
    .object({
      columns: z.number().int().positive().optional(),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      gap: z.number().nonnegative().optional(),
      padding: insetsSchema.optional(),
    })
    .optional(),
  pagination: z
    .object({
      keepTogether: z.boolean().optional(),
    })
    .optional(),
  blocks: z.array(resumeBlockSchema),
});

export const resumeDocumentSchema: z.ZodType<ResumeDocument> = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    title: z.string().min(1),
    locale: z.string().min(1).optional(),
    import: z
      .object({
        format: z.literal("markdown"),
        dialect: z.enum(["mujicv", "standard"]),
        importedAt: z.string().datetime(),
        originalSource: z.string().min(1),
        diagnostics: z.array(
          z.object({
            severity: z.enum(["warning", "error"]),
            code: z.string().min(1),
            message: z.string().min(1),
            line: z.number().int().positive(),
            column: z.number().int().positive().optional(),
          }),
        ),
      })
      .optional(),
  }),
  settings: z.object({
    page: z.object({
      size: z.literal("A4"),
      margin: insetsSchema,
    }),
    typography: z.object({
      fontFamily: z.string().min(1),
      baseFontSize: z.number().positive(),
      lineHeight: z.number().positive(),
    }),
    theme: z.object({
      accent: z.string().min(1),
      textColor: z.string().min(1),
      mutedColor: z.string().min(1),
    }),
  }),
  sections: z.array(resumeSectionSchema).min(1),
});
