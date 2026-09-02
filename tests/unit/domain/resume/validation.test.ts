import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  ResumeDocumentValidationError,
  validateResumeDocument,
} from "@/domain/resume/validation";

describe("validateResumeDocument", () => {
  it("accepts the default resume document", () => {
    const parsed = validateResumeDocument(createDefaultResumeDocument());

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sections).toHaveLength(2);
  });

  it("accepts a non-empty custom application link", () => {
    const document = createDefaultResumeDocument();
    const profileTitle = document.sections[0]?.title;

    if (!profileTitle) {
      throw new Error("Expected the profile section to have a title");
    }

    profileTitle.content[0]!.content[0] = {
      type: "text",
      text: "个人简介",
      marks: [
        {
          type: "link",
          attrs: { href: "my-resume-app://profile/42?source=editor" },
        },
      ],
    };

    expect(() => validateResumeDocument(document)).not.toThrow();
  });

  it("rejects duplicate section ids", () => {
    const document = createDefaultResumeDocument();

    document.sections[1]!.id = document.sections[0]!.id;

    expect(() => validateResumeDocument(document)).toThrowError(
      ResumeDocumentValidationError,
    );

    try {
      validateResumeDocument(document);
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeDocumentValidationError);
      expect((error as ResumeDocumentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate_section_id",
            path: "sections[1].id",
          }),
        ]),
      );
    }
  });

  it("rejects duplicate block ids and out-of-range styling values", () => {
    const document = createDefaultResumeDocument();
    const firstBlock = document.sections[0]!.blocks[0];

    if (firstBlock.type !== "text") {
      throw new Error("Expected the first default block to be text");
    }

    document.sections[0]!.blocks[1]!.id = firstBlock.id;
    firstBlock.style = {
      ...firstBlock.style,
      color: "blue",
      fontSize: 200,
    };
    document.sections[0]!.layout = {
      ...document.sections[0]!.layout,
      gap: 200,
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 120,
      },
    };

    try {
      validateResumeDocument(document);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeDocumentValidationError);
      expect((error as ResumeDocumentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate_block_id",
            path: "sections[0].blocks[1].id",
          }),
          expect.objectContaining({
            code: "invalid_color",
            path: "sections[0].blocks[0].style.color",
          }),
          expect.objectContaining({
            code: "out_of_range",
            path: "sections[0].blocks[0].style.fontSize",
          }),
          expect.objectContaining({
            code: "out_of_range",
            path: "sections[0].layout.gap",
          }),
          expect.objectContaining({
            code: "out_of_range",
            path: "sections[0].layout.padding.left",
          }),
        ]),
      );
    }
  });

  it("rejects invalid nested list-item child block styles", () => {
    const document = createDefaultResumeDocument();
    const listBlock = document.sections[0]!.blocks[1];

    expect(listBlock.type).toBe("list");

    if (listBlock.type !== "list") {
      throw new Error("Expected the profile highlights block to stay a list.");
    }

    const firstChild = listBlock.items[0]!.children[0];

    expect(firstChild?.type).toBe("text");

    if (firstChild?.type !== "text") {
      throw new Error("Expected the first nested list item child to stay a text block.");
    }

    listBlock.items[0]!.children[0] = {
      ...firstChild,
      style: {
        fontSize: 100,
        color: "blue",
      },
    };

    try {
      validateResumeDocument(document);
      throw new Error("Expected nested list item validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeDocumentValidationError);
      expect((error as ResumeDocumentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "out_of_range",
            path: "sections[0].blocks[1].items[0].children[0].style.fontSize",
          }),
          expect.objectContaining({
            code: "invalid_color",
            path: "sections[0].blocks[1].items[0].children[0].style.color",
          }),
        ]),
      );
    }
  });

  it("rejects a font family outside the trusted preset catalog", () => {
    const document = createDefaultResumeDocument();

    document.settings.typography.fontFamily =
      "serif;background-image:url(https://attacker.example/pixel)";

    expect(() => validateResumeDocument(document)).toThrowError(
      ResumeDocumentValidationError,
    );

    try {
      validateResumeDocument(document);
    } catch (error) {
      expect((error as ResumeDocumentValidationError).issues).toContainEqual(
        expect.objectContaining({
          code: "unsupported_font_family",
          path: "settings.typography.fontFamily",
        }),
      );
    }
  });

  it("rejects excessive raw nesting before recursive schema parsing", () => {
    const document = createDefaultResumeDocument() as unknown as Record<
      string,
      unknown
    >;
    let cursor: Record<string, unknown> = document;

    for (let depth = 0; depth < 100; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }

    expect(() => validateResumeDocument(document)).toThrowError(
      ResumeDocumentValidationError,
    );
  });

  it("rejects collections that exceed the aggregate document budget", () => {
    const document = createDefaultResumeDocument();
    const firstBlock = document.sections[0]!.blocks[0]!;

    document.sections[0]!.blocks = Array.from({ length: 501 }, (_, index) => ({
      ...firstBlock,
      id: `oversized-block-${index}`,
    }));

    expect(() => validateResumeDocument(document)).toThrowError(
      ResumeDocumentValidationError,
    );
  });
});
