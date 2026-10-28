import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createImageBlock } from "@/domain/resume/images/model";
import { parseResumeMarkdown } from "@/domain/resume/markdown/parse";
import { serializeResumeMarkdown } from "@/domain/resume/markdown/serialize";

const assetId = "bdf94c73-f69e-4f55-9e49-ce5d628b10ec";

it("preserves image identity, geometry and crop through unrelated Markdown edits and portable parsing", () => {
  const document = createDefaultResumeDocument();
  document.schemaVersion = 2;
  const image = {
    ...createImageBlock({
      id: assetId,
      width: 600,
      height: 800,
      name: "Photo [me]",
    }),
    positionX: 24,
    radius: 12,
  };
  document.sections[0]!.blocks.push(image);
  const serialized = serializeResumeMarkdown(document);
  expect(serialized.source).toContain(`](anonresume-asset:${assetId}`);
  const source = serialized.source.replace("Photo", "Portrait");
  for (const baseDocument of [document, { ...document, sections: [] }]) {
    const parsed = parseResumeMarkdown({
      source,
      baseDocument,
      locale: "en-US",
      ...(baseDocument === document
        ? { projection: serialized.projection }
        : {}),
    });
    expect(parsed.diagnostics).toEqual([]);
    const found = parsed.document?.sections[0]?.blocks.find(
      (block) => block.type === "image",
    );
    expect(found).toMatchObject({
      type: "image",
      assetId,
      width: image.width,
      height: image.height,
      positionX: 24,
      radius: 12,
      alt: "Portrait [me]",
    });
    if (baseDocument === document)
      expect(found).toMatchObject({
        intrinsicWidth: 600,
        intrinsicHeight: 800,
      });
    if (baseDocument === document) expect(found?.id).toBe(image.id);
  }
});

it("rejects external image references instead of silently removing them", () => {
  const document = createDefaultResumeDocument();
  const serialized = serializeResumeMarkdown(document);
  const result = parseResumeMarkdown({
    source: `${serialized.source}\n\n![photo](https://example.test/me.png)`,
    baseDocument: document,
    locale: "en-US",
  });
  expect(result.hasErrors).toBe(true);
  expect(
    result.diagnostics.some((item) => item.code === "image_asset_required"),
  ).toBe(true);
});

it("resets image attributes removed from Markdown without losing identity or intrinsic dimensions", () => {
  const document = createDefaultResumeDocument();
  const image = {
    ...createImageBlock({
      id: assetId,
      width: 600,
      height: 800,
      name: "Photo",
    }),
    radius: 12,
    positionX: 24,
  };
  document.sections[0]!.blocks.push(image);
  const serialized = serializeResumeMarkdown(document);
  const parsed = parseResumeMarkdown({
    source: serialized.source
      .replace(" positionX=24", "")
      .replace(" radius=12", ""),
    baseDocument: document,
    projection: serialized.projection,
    locale: "en-US",
  });
  expect(parsed.hasErrors).toBe(false);
  expect(
    parsed.document?.sections[0]?.blocks.find(
      (block) => block.type === "image",
    ),
  ).toMatchObject({
    id: image.id,
    radius: 0,
    positionX: 50,
    width: image.width,
    height: image.height,
    intrinsicWidth: 600,
    intrinsicHeight: 800,
  });
});
