import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  createResumeDocumentFromTemplate,
  isResumeTemplateId,
  listResumeTemplates,
  resumeTemplateIds,
} from "@/domain/resume/templates";

it("exposes the four stable resume templates", () => {
  expect(resumeTemplateIds).toEqual([
    "blank",
    "foundation",
    "frontend",
    "fullstack",
  ]);
  expect(listResumeTemplates("zh-CN").map(({ id }) => id)).toEqual(
    resumeTemplateIds,
  );
});

it("recognizes only stable resume template identifiers", () => {
  expect(resumeTemplateIds.map((id) => isResumeTemplateId(id))).toEqual([
    true,
    true,
    true,
    true,
  ]);
  expect(isResumeTemplateId("unknown")).toBe(false);
  expect(isResumeTemplateId(null)).toBe(false);
});

it.each(["zh-CN", "en-US"] as const)(
  "lists fresh schema-valid %s template documents",
  (locale) => {
    const first = listResumeTemplates(locale);
    const second = listResumeTemplates(locale);

    expect(first.map(({ document }) => validateResumeDocument(document))).toEqual(
      first.map(({ document }) => document),
    );
    expect(first.map(({ document }) => document.meta.locale)).toEqual([
      locale,
      locale,
      locale,
      locale,
    ]);

    first[0]!.document.sections[0]!.blocks[0] = {
      id: "changed",
      type: "text",
      content: { type: "doc", content: [] },
    };
    expect(second[0]!.document.sections[0]!.blocks[0]!.id).toBe(
      "block-personal-information",
    );
  },
);

it("creates a minimal localized blank editor foundation", () => {
  const document = createResumeDocumentFromTemplate("blank", "zh-CN");

  expect(validateResumeDocument(document)).toEqual(document);
  expect(document.meta.title).toBe("未命名简历");
  expect(
    document.sections.map((section) =>
      section.title ? getPlainTextFromRichText(section.title) : "",
    ),
  ).toEqual(["个人信息", "工作经历"]);
  expect(
    document.sections.map((section) => ({
      direction: section.layout?.direction,
      blocks: section.blocks.map((block) => block.type),
    })),
  ).toEqual([
    { direction: "vertical", blocks: ["text"] },
    { direction: "vertical", blocks: ["text"] },
  ]);
  expect(JSON.stringify(document)).not.toMatch(
    /AnonResume|Next\.js|React|Bun|Ant Design|2024\.01|2026\.01|共享渲染器|前端工程师/,
  );
});

it("returns independent template documents", () => {
  const first = createResumeDocumentFromTemplate("frontend", "zh-CN");
  const second = createResumeDocumentFromTemplate("frontend", "zh-CN");

  first.meta.title = "Changed";
  expect(second.meta.title).toBe("前端版简历");
});
