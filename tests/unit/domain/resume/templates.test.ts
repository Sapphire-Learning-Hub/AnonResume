import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  createResumeDocumentFromTemplate,
  isResumeTemplateId,
  listResumeTemplates,
  resumeTemplateCollectionIds,
  resumeTemplateIds,
} from "@/domain/resume/templates";

it("exposes the blank template and four visually distinct resume templates", () => {
  expect(resumeTemplateIds).toEqual([
    "blank",
    "centered",
    "classic",
    "modular",
    "compact",
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
    true,
  ]);
  expect(isResumeTemplateId("unknown")).toBe(false);
  expect(isResumeTemplateId(null)).toBe(false);
});

it("exposes localized market metadata for filtering and search", () => {
  expect(resumeTemplateCollectionIds).toEqual([
    "all",
    "recommended",
    "minimal",
    "classic",
    "structured",
    "compact",
  ]);

  const zhTemplates = listResumeTemplates("zh-CN");
  const enTemplates = listResumeTemplates("en-US");

  expect(zhTemplates.find(({ id }) => id === "modular")).toMatchObject({
    collectionIds: ["recommended", "structured"],
    searchKeywords: expect.arrayContaining(["双列", "技术"]),
  });
  expect(enTemplates.find(({ id }) => id === "modular")).toMatchObject({
    collectionIds: ["recommended", "structured"],
    searchKeywords: expect.arrayContaining(["two-column", "technical"]),
  });
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
  const first = createResumeDocumentFromTemplate("centered", "zh-CN");
  const second = createResumeDocumentFromTemplate("centered", "zh-CN");

  first.meta.title = "Changed";
  expect(second.meta.title).toBe("居中叙事简历");
});

it("builds each visual template from a materially different document structure", () => {
  const centered = createResumeDocumentFromTemplate("centered", "zh-CN");
  const classic = createResumeDocumentFromTemplate("classic", "zh-CN");
  const modular = createResumeDocumentFromTemplate("modular", "zh-CN");
  const compact = createResumeDocumentFromTemplate("compact", "zh-CN");

  expect(centered.sections[0]?.title).toBeUndefined();
  expect(centered.settings.typography.fontFamily).toContain("Noto Serif SC");
  expect(centered.sections[0]?.layout?.gap).toBe(9);

  expect(classic.settings.theme.accent).toBe("#18534b");
  expect(classic.sections[0]?.blocks[0]).toMatchObject({ type: "row" });

  expect(modular.sections[1]?.layout?.columns).toBe(2);
  expect(
    modular.sections[1]?.blocks.some((block) => block.type === "badges"),
  ).toBe(true);

  expect(compact.settings.typography.baseFontSize).toBe(12);
  expect(compact.sections[0]?.blocks[0]).toMatchObject({
    type: "row",
  });
});
