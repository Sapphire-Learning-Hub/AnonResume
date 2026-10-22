import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";
import {
  createPersonalTemplateDocument,
  instantiatePersonalTemplateDocument,
} from "@/domain/resume/personal-templates/document";

describe("personal template documents", () => {
  it("preserves the complete structured document without stale import provenance or input mutation", () => {
    const source = createResumeDocumentFromTemplate("modular", "zh-CN");
    source.meta.import = {
      format: "markdown",
      dialect: "standard",
      importedAt: new Date().toISOString(),
      originalSource: "old private source",
      diagnostics: [],
    };
    const original = structuredClone(source);
    const result = createPersonalTemplateDocument(source);
    const expected = structuredClone(source);
    delete expected.meta.import;
    expect(result).toEqual(expected);
    expect(source).toEqual(original);
    result.sections[0].visible = false;
    expect(source.sections[0].visible).toBe(true);
  });

  it("creates an independent document with the chosen title", () => {
    const source = createResumeDocumentFromTemplate("classic", "en-US");
    const result = instantiatePersonalTemplateDocument(source, "My template");
    expect(result).toEqual({
      ...source,
      meta: { ...source.meta, title: "My template" },
    });
    expect(source.meta.title).not.toBe("My template");
  });

  it("refuses unsupported or invalid documents instead of substituting a blank resume", () => {
    const source = createResumeDocumentFromTemplate("modular", "zh-CN");
    expect(() =>
      createPersonalTemplateDocument({ ...source, schemaVersion: 999 }),
    ).toThrow();
    expect(() =>
      createPersonalTemplateDocument({ ...source, sections: [] }),
    ).toThrow();
  });
});
