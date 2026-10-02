import { describe, expect, it } from "vitest";

import {
  ONBOARDING_EDIT_BLOCK_ID,
  ONBOARDING_INSERT_SECTION_ID,
  ONBOARDING_REORDER_SECTION_ID,
  createEditorOnboardingDocument,
  evaluateEditorOnboardingDocumentStep,
} from "@/domain/onboarding/editor-basics-document";
import type { ResumeDocument, TextBlock } from "@/domain/resume/schema";
import { validateResumeDocument } from "@/domain/resume/validation";

function cloneDocument(document: ResumeDocument) {
  return structuredClone(document);
}

function getTargetTextBlock(document: ResumeDocument) {
  const block = document.sections
    .flatMap((section) => section.blocks)
    .find((candidate) => candidate.id === ONBOARDING_EDIT_BLOCK_ID);

  if (!block || block.type !== "text") {
    throw new Error("Missing onboarding edit target");
  }

  return block as TextBlock;
}

describe("editor onboarding practice document", () => {
  it.each(["zh-CN", "en-US"] as const)(
    "creates a valid %s practice document with stable targets",
    (locale) => {
      const document = createEditorOnboardingDocument(locale);

      expect(() => validateResumeDocument(document)).not.toThrow();
      expect(document.meta.locale).toBe(locale);
      expect(getTargetTextBlock(document).id).toBe(ONBOARDING_EDIT_BLOCK_ID);
      expect(document.sections.map(({ id }) => id)).toContain(
        ONBOARDING_INSERT_SECTION_ID,
      );
      expect(document.sections.map(({ id }) => id)).toContain(
        ONBOARDING_REORDER_SECTION_ID,
      );
    },
  );

  it("requires the designated text to change", () => {
    const original = createEditorOnboardingDocument("zh-CN");
    const changed = cloneDocument(original);
    const unrelated = cloneDocument(original);

    getTargetTextBlock(changed).content.content[0]!.content = [
      { type: "text", text: "我已经完成了第一次内容修改。" },
    ];
    unrelated.meta.title = "无关标题变化";

    expect(evaluateEditorOnboardingDocumentStep("edit-text", original)).toBe(false);
    expect(evaluateEditorOnboardingDocumentStep("edit-text", unrelated)).toBe(false);
    expect(evaluateEditorOnboardingDocumentStep("edit-text", changed)).toBe(true);
  });

  it("requires a bold mark on the designated text", () => {
    const original = createEditorOnboardingDocument("zh-CN");
    const changed = cloneDocument(original);
    const unrelated = cloneDocument(original);
    const node = getTargetTextBlock(changed).content.content[0]!.content[0];

    if (!node || node.type !== "text") throw new Error("Missing target text");
    node.marks = [{ type: "bold" }];
    unrelated.settings.theme.accent = "#ff0000";

    expect(evaluateEditorOnboardingDocumentStep("format-text", original)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("format-text", unrelated)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("format-text", changed)).toBe(true);
  });

  it("requires new content in the designated insertion section", () => {
    const original = createEditorOnboardingDocument("zh-CN");
    const changed = cloneDocument(original);
    const unrelated = cloneDocument(original);
    const section = changed.sections.find(
      ({ id }) => id === ONBOARDING_INSERT_SECTION_ID,
    );

    if (!section) throw new Error("Missing insertion section");
    section.blocks.push({
      id: "block-user-inserted",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "新增内容" }],
          },
        ],
      },
    });
    unrelated.sections[0]!.visible = false;

    expect(evaluateEditorOnboardingDocumentStep("insert-content", original)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("insert-content", unrelated)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("insert-content", changed)).toBe(
      true,
    );
  });

  it("requires document appearance settings to change", () => {
    const original = createEditorOnboardingDocument("zh-CN");
    const changed = cloneDocument(original);
    const unrelated = cloneDocument(original);

    changed.settings.theme.accent = "#d23c70";
    unrelated.meta.title = "无关标题变化";

    expect(evaluateEditorOnboardingDocumentStep("change-design", original)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("change-design", unrelated)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("change-design", changed)).toBe(
      true,
    );
  });

  it("requires the designated section to move", () => {
    const original = createEditorOnboardingDocument("zh-CN");
    const changed = cloneDocument(original);
    const unrelated = cloneDocument(original);
    const sourceIndex = changed.sections.findIndex(
      ({ id }) => id === ONBOARDING_REORDER_SECTION_ID,
    );
    const [section] = changed.sections.splice(sourceIndex, 1);

    changed.sections.unshift(section!);
    unrelated.settings.theme.textColor = "#111111";

    expect(evaluateEditorOnboardingDocumentStep("reorder-content", original)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("reorder-content", unrelated)).toBe(
      false,
    );
    expect(evaluateEditorOnboardingDocumentStep("reorder-content", changed)).toBe(
      true,
    );
  });
});
