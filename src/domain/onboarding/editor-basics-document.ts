import {
  createRichTextFromPlainText,
  getPlainTextFromRichText,
} from "@/domain/resume/operations";
import type {
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
  TextBlock,
} from "@/domain/resume/schema";
import { getMessages, resolveLocale, type AppLocale } from "@/i18n/messages";

import type { EditorOnboardingStepId } from "./editor-basics";

export const ONBOARDING_EDIT_BLOCK_ID = "onboarding-block-edit-target";
export const ONBOARDING_INSERT_SECTION_ID = "onboarding-section-practice";
export const ONBOARDING_REORDER_SECTION_ID = "onboarding-section-reorder";

function createPracticeTextBlock(
  id: string,
  text: string,
  style?: TextBlock["style"],
): TextBlock {
  return {
    id,
    type: "text",
    content: createRichTextFromPlainText(text),
    ...(style ? { style } : {}),
  };
}

export function createEditorOnboardingDocument(
  locale: AppLocale,
): ResumeDocument {
  const messages = getMessages(locale);

  return {
    schemaVersion: 1,
    meta: {
      title: messages["onboarding.document.title"],
      locale,
    },
    settings: {
      page: {
        size: "A4",
        margin: { top: 32, right: 32, bottom: 32, left: 32 },
      },
      typography: {
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        baseFontSize: 14,
        lineHeight: 1.45,
      },
      theme: {
        accent: "#0f62fe",
        textColor: "#0f172a",
        mutedColor: "#475569",
      },
    },
    sections: [
      {
        id: ONBOARDING_INSERT_SECTION_ID,
        title: createRichTextFromPlainText(
          messages["onboarding.document.practiceTitle"],
        ),
        semantic: "profile",
        visible: true,
        layout: { direction: "vertical", gap: 12 },
        pagination: { keepTogether: true },
        blocks: [
          createPracticeTextBlock(
            ONBOARDING_EDIT_BLOCK_ID,
            messages["onboarding.document.editTarget"],
            { fontSize: 20, fontWeight: 700 },
          ),
        ],
      },
      {
        id: ONBOARDING_REORDER_SECTION_ID,
        title: createRichTextFromPlainText(
          messages["onboarding.document.reorderTitle"],
        ),
        semantic: "experience",
        visible: true,
        layout: { direction: "vertical", gap: 12 },
        pagination: { keepTogether: true },
        blocks: [
          createPracticeTextBlock(
            "onboarding-block-reorder-content",
            messages["onboarding.document.reorderDescription"],
          ),
        ],
      },
    ],
  };
}

function visitBlocks(
  blocks: readonly ResumeBlock[],
  visitor: (block: ResumeBlock) => void,
) {
  for (const block of blocks) {
    visitor(block);

    if (block.type === "group" || block.type === "row") {
      visitBlocks(block.children, visitor);
    } else if (block.type === "list") {
      for (const item of block.items) {
        visitBlocks(item.children, visitor);
      }
    }
  }
}

function findTextBlock(document: ResumeDocument, blockId: string) {
  let result: TextBlock | undefined;

  for (const section of document.sections) {
    visitBlocks(section.blocks, (block) => {
      if (block.id === blockId && block.type === "text") {
        result = block;
      }
    });
  }

  return result;
}

function findSection(document: ResumeDocument, sectionId: string) {
  return document.sections.find(({ id }) => id === sectionId);
}

function collectBlockIds(section?: ResumeSection) {
  const ids = new Set<string>();

  if (section) {
    visitBlocks(section.blocks, (block) => ids.add(block.id));
  }

  return ids;
}

function hasBoldMark(block?: TextBlock) {
  return Boolean(
    block?.content.content.some((paragraph) =>
      paragraph.content.some(
        (node) =>
          node.type === "text" &&
          node.marks?.some(({ type }) => type === "bold"),
      ),
    ),
  );
}

export function evaluateEditorOnboardingDocumentStep(
  stepId: EditorOnboardingStepId,
  document: ResumeDocument,
) {
  const baseline = createEditorOnboardingDocument(
    resolveLocale(document.meta.locale),
  );

  if (stepId === "edit-text") {
    const current = findTextBlock(document, ONBOARDING_EDIT_BLOCK_ID);
    const initial = findTextBlock(baseline, ONBOARDING_EDIT_BLOCK_ID);
    const currentText = current
      ? getPlainTextFromRichText(current.content).trim()
      : "";
    const initialText = initial
      ? getPlainTextFromRichText(initial.content).trim()
      : "";

    return currentText.length > 0 && currentText !== initialText;
  }

  if (stepId === "format-text") {
    return hasBoldMark(findTextBlock(document, ONBOARDING_EDIT_BLOCK_ID));
  }

  if (stepId === "insert-content") {
    const currentIds = collectBlockIds(
      findSection(document, ONBOARDING_INSERT_SECTION_ID),
    );
    const initialIds = collectBlockIds(
      findSection(baseline, ONBOARDING_INSERT_SECTION_ID),
    );

    return [...currentIds].some((id) => !initialIds.has(id));
  }

  if (stepId === "change-design") {
    return JSON.stringify(document.settings) !== JSON.stringify(baseline.settings);
  }

  if (stepId === "reorder-content") {
    return (
      document.sections.findIndex(
        ({ id }) => id === ONBOARDING_REORDER_SECTION_ID,
      ) !==
      baseline.sections.findIndex(
        ({ id }) => id === ONBOARDING_REORDER_SECTION_ID,
      )
    );
  }

  return false;
}
