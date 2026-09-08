import { z } from "zod";

import {
  formatMessage,
  getMessages,
  resolveLocale,
  type AppMessages,
  type MessageKey,
} from "@/i18n/messages";

import { isResumeFontFamilyAllowed } from "./font-presets";
import {
  resumeDocumentSchema,
  type ResumeBlock,
  type ResumeDocument,
  type RichTextContent,
} from "./schema";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const resumeValidationLimits = {
  maxSectionCount: 24,
  maxBlockTreeDepth: 6,
  maxIdLength: 120,
  maxMetaTitleLength: 160,
  maxLocaleLength: 32,
  maxSemanticLength: 64,
  maxFontFamilyLength: 160,
  maxRichTextNodeLength: 4000,
  maxBadgeTextLength: 80,
  minFontSize: 8,
  maxFontSize: 72,
  minLineHeight: 1,
  maxLineHeight: 3,
  minGap: 0,
  maxGap: 96,
  minInset: 0,
  maxInset: 96,
  maxRawNestingDepth: 32,
  maxCollectionLength: 500,
  maxDocumentNodes: 10_000,
  maxAggregateStringLength: 200_000,
} as const;

export interface ResumeValidationIssue {
  code:
    | "duplicate_section_id"
    | "duplicate_block_id"
    | "max_depth_exceeded"
    | "string_too_long"
    | "invalid_color"
    | "unsupported_font_family"
    | "document_too_complex"
    | "out_of_range";
  path: string;
  message: string;
}

export class ResumeDocumentValidationError extends Error {
  issues: ResumeValidationIssue[];

  constructor(issues: ResumeValidationIssue[]) {
    super("resume_validation_failed");
    this.name = "ResumeDocumentValidationError";
    this.issues = issues;
  }
}

function rejectOverComplexRawDocument(document: unknown) {
  const stack: Array<{ value: unknown; depth: number; path: string }> = [
    { value: document, depth: 0, path: "$" },
  ];
  const visited = new WeakSet<object>();
  let nodeCount = 0;
  let aggregateStringLength = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;

    nodeCount += 1;

    if (nodeCount > resumeValidationLimits.maxDocumentNodes) {
      throw new ResumeDocumentValidationError([
        {
          code: "document_too_complex",
          path: current.path,
          message: "Resume document exceeds the total node limit.",
        },
      ]);
    }

    if (typeof current.value === "string") {
      aggregateStringLength += current.value.length;

      if (
        aggregateStringLength >
        resumeValidationLimits.maxAggregateStringLength
      ) {
        throw new ResumeDocumentValidationError([
          {
            code: "document_too_complex",
            path: current.path,
            message: "Resume document exceeds the aggregate text limit.",
          },
        ]);
      }

      continue;
    }

    if (!current.value || typeof current.value !== "object") {
      continue;
    }

    if (current.depth > resumeValidationLimits.maxRawNestingDepth) {
      throw new ResumeDocumentValidationError([
        {
          code: "document_too_complex",
          path: current.path,
          message: "Resume document exceeds the raw nesting limit.",
        },
      ]);
    }

    if (visited.has(current.value)) {
      continue;
    }

    visited.add(current.value);

    if (Array.isArray(current.value)) {
      if (
        current.value.length > resumeValidationLimits.maxCollectionLength
      ) {
        throw new ResumeDocumentValidationError([
          {
            code: "document_too_complex",
            path: current.path,
            message: "Resume document contains an oversized collection.",
          },
        ]);
      }

      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: current.value[index],
          depth: current.depth + 1,
          path: `${current.path}[${index}]`,
        });
      }

      continue;
    }

    for (const [key, value] of Object.entries(current.value)) {
      stack.push({
        value,
        depth: current.depth + 1,
        path: `${current.path}.${key}`,
      });
    }
  }
}

function getValidationMessage(
  messages: AppMessages,
  key: MessageKey,
  values?: Record<string, string | number>,
) {
  return formatMessage(messages, key, values);
}

function getValidationLabel(messages: AppMessages, key: MessageKey) {
  return messages[key];
}

function pushStringLengthIssue(
  issues: ResumeValidationIssue[],
  path: string,
  label: string,
  value: string | undefined,
  maxLength: number,
  messages: AppMessages,
) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return;
  }

  issues.push({
    code: "string_too_long",
    path,
    message: getValidationMessage(messages, "validation.stringTooLong", {
      label,
      max: maxLength,
    }),
  });
}

function pushRangeIssue(
  issues: ResumeValidationIssue[],
  path: string,
  label: string,
  value: number | undefined,
  min: number,
  max: number,
  messages: AppMessages,
) {
  if (value === undefined || (value >= min && value <= max)) {
    return;
  }

  issues.push({
    code: "out_of_range",
    path,
    message: getValidationMessage(messages, "validation.outOfRange", {
      label,
      min,
      max,
    }),
  });
}

function pushColorIssue(
  issues: ResumeValidationIssue[],
  path: string,
  label: string,
  value: string,
  messages: AppMessages,
) {
  if (HEX_COLOR_PATTERN.test(value)) {
    return;
  }

  issues.push({
    code: "invalid_color",
    path,
    message: getValidationMessage(messages, "validation.invalidColor", {
      label,
    }),
  });
}

function validateRichTextContent(
  content: RichTextContent | undefined,
  path: string,
  issues: ResumeValidationIssue[],
  messages: AppMessages,
) {
  if (!content) {
    return;
  }

  content.content.forEach((paragraph, paragraphIndex) => {
    paragraph.content.forEach((node, nodeIndex) => {
      const nodePath = `${path}.content[${paragraphIndex}].content[${nodeIndex}]`;

      if (node.type === "text") {
        pushStringLengthIssue(
          issues,
          `${nodePath}.text`,
          getValidationLabel(messages, "validation.label.textNode"),
          node.text,
          resumeValidationLimits.maxRichTextNodeLength,
          messages,
        );
      }
    });
  });
}

function validateInsets(
  insets:
    | ResumeDocument["settings"]["page"]["margin"]
    | NonNullable<ResumeDocument["sections"][number]["layout"]>["padding"]
    | undefined,
  path: string,
  label: string,
  issues: ResumeValidationIssue[],
  messages: AppMessages,
) {
  if (!insets) {
    return;
  }

  pushRangeIssue(
    issues,
    `${path}.top`,
    `${label} top`,
    insets.top,
    resumeValidationLimits.minInset,
    resumeValidationLimits.maxInset,
    messages,
  );
  pushRangeIssue(
    issues,
    `${path}.right`,
    `${label} right`,
    insets.right,
    resumeValidationLimits.minInset,
    resumeValidationLimits.maxInset,
    messages,
  );
  pushRangeIssue(
    issues,
    `${path}.bottom`,
    `${label} bottom`,
    insets.bottom,
    resumeValidationLimits.minInset,
    resumeValidationLimits.maxInset,
    messages,
  );
  pushRangeIssue(
    issues,
    `${path}.left`,
    `${label} left`,
    insets.left,
    resumeValidationLimits.minInset,
    resumeValidationLimits.maxInset,
    messages,
  );
}

function validateBlock(
  block: ResumeBlock,
  path: string,
  depth: number,
  blockIdPaths: Map<string, string>,
  issues: ResumeValidationIssue[],
  messages: AppMessages,
) {
  pushStringLengthIssue(
    issues,
    `${path}.id`,
    getValidationLabel(messages, "validation.label.blockId"),
    block.id,
    resumeValidationLimits.maxIdLength,
    messages,
  );

  const existingPath = blockIdPaths.get(block.id);

  if (existingPath) {
    issues.push({
      code: "duplicate_block_id",
      path: `${path}.id`,
      message: getValidationMessage(messages, "validation.duplicateBlockId", {
        id: block.id,
      }),
    });
  } else {
    blockIdPaths.set(block.id, `${path}.id`);
  }

  if (depth > resumeValidationLimits.maxBlockTreeDepth) {
    issues.push({
      code: "max_depth_exceeded",
      path,
      message: getValidationMessage(messages, "validation.maxDepthExceeded", {
        max: resumeValidationLimits.maxBlockTreeDepth,
      }),
    });
  }

  switch (block.type) {
    case "text":
      validateRichTextContent(block.content, `${path}.content`, issues, messages);
      pushRangeIssue(
        issues,
        `${path}.style.fontSize`,
        getValidationLabel(messages, "validation.label.fontSize"),
        block.style?.fontSize,
        resumeValidationLimits.minFontSize,
        resumeValidationLimits.maxFontSize,
        messages,
      );
      pushRangeIssue(
        issues,
        `${path}.style.lineHeight`,
        getValidationLabel(messages, "validation.label.lineHeight"),
        block.style?.lineHeight,
        resumeValidationLimits.minLineHeight,
        resumeValidationLimits.maxLineHeight,
        messages,
      );

      if (block.style?.color) {
        pushColorIssue(
          issues,
          `${path}.style.color`,
          getValidationLabel(messages, "validation.label.textColor"),
          block.style.color,
          messages,
        );
      }

      break;
    case "list":
      pushRangeIssue(
        issues,
        `${path}.gap`,
        getValidationLabel(messages, "validation.label.listGap"),
        block.gap,
        resumeValidationLimits.minGap,
        resumeValidationLimits.maxGap,
        messages,
      );
      block.items.forEach((item, itemIndex) => {
        pushStringLengthIssue(
          issues,
          `${path}.items[${itemIndex}].id`,
          getValidationLabel(messages, "validation.label.listItemId"),
          item.id,
          resumeValidationLimits.maxIdLength,
          messages,
        );
        item.children.forEach((child, childIndex) => {
          validateBlock(
            child,
            `${path}.items[${itemIndex}].children[${childIndex}]`,
            depth + 1,
            blockIdPaths,
            issues,
            messages,
          );
        });
      });
      break;
    case "badges":
      pushRangeIssue(
        issues,
        `${path}.gap`,
        getValidationLabel(messages, "validation.label.badgeGap"),
        block.gap,
        resumeValidationLimits.minGap,
        resumeValidationLimits.maxGap,
        messages,
      );
      block.items.forEach((item, itemIndex) => {
        pushStringLengthIssue(
          issues,
          `${path}.items[${itemIndex}].id`,
          getValidationLabel(messages, "validation.label.badgeId"),
          item.id,
          resumeValidationLimits.maxIdLength,
          messages,
        );
        pushStringLengthIssue(
          issues,
          `${path}.items[${itemIndex}].text`,
          getValidationLabel(messages, "validation.label.badgeText"),
          item.text,
          resumeValidationLimits.maxBadgeTextLength,
          messages,
        );
      });
      break;
    case "group":
    case "row":
      pushRangeIssue(
        issues,
        `${path}.gap`,
        getValidationLabel(messages, "validation.label.blockGap"),
        block.gap,
        resumeValidationLimits.minGap,
        resumeValidationLimits.maxGap,
        messages,
      );
      block.children.forEach((child, childIndex) => {
        validateBlock(
          child,
          `${path}.children[${childIndex}]`,
          depth + 1,
          blockIdPaths,
          issues,
          messages,
        );
      });
      break;
  }
}

function collectResumeValidationIssues(document: ResumeDocument) {
  const messages = getMessages(resolveLocale(document.meta.locale));
  const issues: ResumeValidationIssue[] = [];
  const sectionIdPaths = new Map<string, string>();
  const blockIdPaths = new Map<string, string>();

  if (document.sections.length > resumeValidationLimits.maxSectionCount) {
    issues.push({
      code: "out_of_range",
      path: "sections",
      message: getValidationMessage(messages, "validation.sectionCount", {
        max: resumeValidationLimits.maxSectionCount,
      }),
    });
  }

  pushStringLengthIssue(
    issues,
    "meta.title",
    getValidationLabel(messages, "validation.label.resumeTitle"),
    document.meta.title,
    resumeValidationLimits.maxMetaTitleLength,
    messages,
  );
  pushStringLengthIssue(
    issues,
    "meta.locale",
    getValidationLabel(messages, "validation.label.locale"),
    document.meta.locale,
    resumeValidationLimits.maxLocaleLength,
    messages,
  );
  pushStringLengthIssue(
    issues,
    "settings.typography.fontFamily",
    getValidationLabel(messages, "validation.label.fontFamily"),
    document.settings.typography.fontFamily,
    resumeValidationLimits.maxFontFamilyLength,
    messages,
  );
  if (!isResumeFontFamilyAllowed(document.settings.typography.fontFamily)) {
    issues.push({
      code: "unsupported_font_family",
      path: "settings.typography.fontFamily",
      message: getValidationMessage(
        messages,
        "validation.unsupportedFontFamily",
      ),
    });
  }
  pushRangeIssue(
    issues,
    "settings.typography.baseFontSize",
    getValidationLabel(messages, "validation.label.baseFontSize"),
    document.settings.typography.baseFontSize,
    resumeValidationLimits.minFontSize,
    resumeValidationLimits.maxFontSize,
    messages,
  );
  pushRangeIssue(
    issues,
    "settings.typography.lineHeight",
    getValidationLabel(messages, "validation.label.baseLineHeight"),
    document.settings.typography.lineHeight,
    resumeValidationLimits.minLineHeight,
    resumeValidationLimits.maxLineHeight,
    messages,
  );
  validateInsets(
    document.settings.page.margin,
    "settings.page.margin",
    getValidationLabel(messages, "validation.label.pageMargin"),
    issues,
    messages,
  );
  pushColorIssue(
    issues,
    "settings.theme.accent",
    getValidationLabel(messages, "validation.label.accentColor"),
    document.settings.theme.accent,
    messages,
  );
  pushColorIssue(
    issues,
    "settings.theme.textColor",
    getValidationLabel(messages, "validation.label.textColor"),
    document.settings.theme.textColor,
    messages,
  );
  pushColorIssue(
    issues,
    "settings.theme.mutedColor",
    getValidationLabel(messages, "validation.label.mutedColor"),
    document.settings.theme.mutedColor,
    messages,
  );

  document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `sections[${sectionIndex}]`;

    pushStringLengthIssue(
      issues,
      `${sectionPath}.id`,
      getValidationLabel(messages, "validation.label.sectionId"),
      section.id,
      resumeValidationLimits.maxIdLength,
      messages,
    );
    pushStringLengthIssue(
      issues,
      `${sectionPath}.semantic`,
      getValidationLabel(messages, "validation.label.sectionSemantic"),
      section.semantic,
      resumeValidationLimits.maxSemanticLength,
      messages,
    );

    const existingPath = sectionIdPaths.get(section.id);

    if (existingPath) {
      issues.push({
        code: "duplicate_section_id",
        path: `${sectionPath}.id`,
        message: getValidationMessage(messages, "validation.duplicateSectionId", {
          id: section.id,
        }),
      });
    } else {
      sectionIdPaths.set(section.id, `${sectionPath}.id`);
    }

    validateRichTextContent(section.title, `${sectionPath}.title`, issues, messages);
    if (section.titleStyle?.color) {
      pushColorIssue(
        issues,
        `${sectionPath}.titleStyle.color`,
        getValidationLabel(messages, "validation.label.sectionTitleColor"),
        section.titleStyle.color,
        messages,
      );
    }
    pushRangeIssue(
      issues,
      `${sectionPath}.layout.gap`,
      getValidationLabel(messages, "validation.label.sectionGap"),
      section.layout?.gap,
      resumeValidationLimits.minGap,
      resumeValidationLimits.maxGap,
      messages,
    );
    validateInsets(
      section.layout?.padding,
      `${sectionPath}.layout.padding`,
      getValidationLabel(messages, "validation.label.sectionPadding"),
      issues,
      messages,
    );

    section.blocks.forEach((block, blockIndex) => {
      validateBlock(
        block,
        `${sectionPath}.blocks[${blockIndex}]`,
        1,
        blockIdPaths,
        issues,
        messages,
      );
    });
  });

  return issues;
}

export function validateResumeDocument(document: unknown): ResumeDocument {
  rejectOverComplexRawDocument(document);
  const parsed = resumeDocumentSchema.parse(document);
  const issues = collectResumeValidationIssues(parsed);

  if (issues.length > 0) {
    throw new ResumeDocumentValidationError(issues);
  }

  return parsed;
}

export function isResumeStructureValidationError(error: unknown) {
  return error instanceof z.ZodError;
}
