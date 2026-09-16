import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  applySelectedAiChanges,
  type AiResumeProposal,
} from "@/domain/resume/ai/proposal-apply";
import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import { hashAiContent } from "@/domain/resume/ai/content-hash";
import type { RichTextContent } from "@/domain/resume/schema";

function richText(text: string): RichTextContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("AI resume proposals", () => {
  it("applies selected content changes without altering document settings", () => {
    const document = createDefaultResumeDocument("zh-CN");
    const section = document.sections[0]!;
    const textBlock = section.blocks[0]!;
    if (textBlock.type !== "text") throw new Error("Expected text block");
    const proposal: AiResumeProposal = {
      summary: "使表达更清晰",
      changes: [
        {
          id: "change-title",
          type: "replace_section_title",
          sectionId: section.id,
          beforeHash: hashAiContent(section.title ?? null),
          content: richText("个人优势"),
          reason: "标题更具体",
        },
        {
          id: "change-text",
          type: "replace_text",
          sectionId: section.id,
          blockPath: [textBlock.id],
          beforeHash: hashAiContent(textBlock.content),
          content: richText("专注于稳定、清晰的产品交付。"),
          reason: "减少空泛表述",
        },
      ],
    };

    const result = applySelectedAiChanges({
      document,
      currentVersion: 3,
      baseResumeVersion: 3,
      proposal,
      selectedChangeIds: ["change-text"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.settings).toEqual(document.settings);
    expect(result.document.sections[0]!.title).toEqual(section.title);
    expect(result.document.sections[0]!.blocks[0]).toMatchObject({
      id: textBlock.id,
      type: "text",
      content: richText("专注于稳定、清晰的产品交付。"),
      style: textBlock.style,
    });
  });

  it("rejects the whole selection when a target or version is stale", () => {
    const document = createDefaultResumeDocument("zh-CN");
    const textBlock = document.sections[0]!.blocks[0]!;
    if (textBlock.type !== "text") throw new Error("Expected text block");
    const proposal: AiResumeProposal = {
      changes: [
        {
          id: "stale",
          type: "replace_text",
          sectionId: document.sections[0]!.id,
          blockPath: [textBlock.id],
          beforeHash: hashAiContent(richText("old content")),
          content: richText("new content"),
          reason: "test",
        },
      ],
    };

    expect(
      applySelectedAiChanges({
        document,
        currentVersion: 4,
        baseResumeVersion: 3,
        proposal,
        selectedChangeIds: ["stale"],
      }),
    ).toEqual({
      ok: false,
      conflicts: [{ changeId: "stale", reason: "resume_version_changed" }],
    });

    expect(
      applySelectedAiChanges({
        document,
        currentVersion: 3,
        baseResumeVersion: 3,
        proposal,
        selectedChangeIds: ["stale"],
      }),
    ).toEqual({
      ok: false,
      conflicts: [{ changeId: "stale", reason: "target_content_changed" }],
    });
  });

  it("inserts and deletes list items while preserving the list block", () => {
    const document = createDefaultResumeDocument("zh-CN");
    const section = document.sections[0]!;
    const list = section.blocks.find((block) => block.type === "list");
    if (!list || list.type !== "list") throw new Error("Expected list block");
    const firstItem = list.items[0]!;
    const proposal: AiResumeProposal = {
      changes: [
        {
          id: "insert-item",
          type: "insert_list_item",
          sectionId: section.id,
          listPath: [list.id],
          afterItemId: firstItem.id,
          beforeHash: hashAiContent(list.items),
          content: richText("新增亮点"),
          reason: "补充成果",
        },
      ],
    };

    const inserted = applySelectedAiChanges({
      document,
      currentVersion: 1,
      baseResumeVersion: 1,
      proposal,
      selectedChangeIds: ["insert-item"],
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const insertedList = inserted.document.sections[0]!.blocks.find(
      (block) => block.id === list.id,
    );
    expect(insertedList?.type === "list" ? insertedList.items : []).toHaveLength(
      list.items.length + 1,
    );
  });

  it("rejects fields and operations outside the content contract", () => {
    expect(() =>
      aiResumeProposalSchema.parse({
        changes: [
          {
            id: "bad-change",
            type: "replace_text",
            sectionId: "section-profile",
            blockPath: ["block-profile-summary"],
            beforeHash: "a".repeat(64),
            content: richText("Updated"),
            reason: "test",
            style: { color: "#ff0000" },
          },
        ],
      }),
    ).toThrow();
  });
});
