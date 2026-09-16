import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  buildAiResumeContext,
  createAiContextDelta,
} from "@/lib/ai/context/builder";
import { hashAiContent } from "@/domain/resume/ai/content-hash";

describe("AI resume context", () => {
  it("includes semantic content and stable IDs without visual settings", () => {
    const document = createDefaultResumeDocument("zh-CN");
    const context = buildAiResumeContext({ document, scope: "resume" });
    const serialized = JSON.stringify(context);

    expect(context.sections[0]?.id).toBe("section-profile");
    expect(serialized).toContain("block-profile-summary");
    expect(serialized).not.toContain("fontFamily");
    expect(serialized).not.toContain("fontSize");
    expect(serialized).not.toContain("pagination");
    expect(serialized).not.toContain("#0f62fe");

    const profile = context.sections[0]!;
    expect(profile.editableTargets).toContainEqual({
      type: "replace_section_title",
      sectionId: profile.id,
      beforeHash: hashAiContent(document.sections[0]!.title ?? null),
    });

    const summary = profile.editableTargets.find(
      (target) => target.type === "replace_text",
    );
    expect(summary).toMatchObject({
      type: "replace_text",
      sectionId: profile.id,
      blockPath: ["block-profile-summary"],
    });
    expect(summary?.beforeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("limits section context and reports changed and removed sections", () => {
    const before = createDefaultResumeDocument("zh-CN");
    const scoped = buildAiResumeContext({
      document: before,
      scope: "section",
      sectionId: before.sections[0]!.id,
    });
    expect(scoped.sections).toHaveLength(1);

    const after = structuredClone(before);
    after.sections[0]!.title!.content[0]!.content[0] = {
      type: "text",
      text: "更新后的标题",
    };
    after.sections.pop();

    const delta = createAiContextDelta(
      buildAiResumeContext({ document: before, scope: "resume" }),
      buildAiResumeContext({ document: after, scope: "resume" }),
    );
    expect(delta.changedSections.map((section) => section.id)).toContain(
      "section-profile",
    );
    expect(delta.removedSectionIds).toHaveLength(1);
  });
});
