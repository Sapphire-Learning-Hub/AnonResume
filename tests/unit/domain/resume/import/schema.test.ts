import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { resumeDocumentSchema } from "@/domain/resume/schema";

describe("resume import metadata", () => {
  it("keeps existing schema-version-one documents valid", () => {
    expect(() =>
      resumeDocumentSchema.parse(createDefaultResumeDocument()),
    ).not.toThrow();
  });

  it("preserves Markdown source metadata and diagnostics", () => {
    const document = createDefaultResumeDocument();
    const importedAt = "2026-09-01T14:00:00.000Z";

    const parsed = resumeDocumentSchema.parse({
      ...document,
      meta: {
        ...document.meta,
        import: {
          format: "markdown",
          dialect: "mujicv",
          importedAt,
          originalSource: "# 邹权",
          diagnostics: [
            {
              severity: "warning",
              code: "dialect_auto_detected",
              message: "Detected Mujicv Markdown.",
              line: 1,
            },
          ],
        },
      },
    });

    expect(parsed.meta.import).toEqual({
      format: "markdown",
      dialect: "mujicv",
      importedAt,
      originalSource: "# 邹权",
      diagnostics: [
        {
          severity: "warning",
          code: "dialect_auto_detected",
          message: "Detected Mujicv Markdown.",
          line: 1,
        },
      ],
    });
  });
});
