import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  normalizeResumeDocumentStructure,
  cloneBlockWithFreshIds,
} from "@/domain/resume/block-tree";
import {
  collectImageAssetIds,
  createImageBlock,
} from "@/domain/resume/images/model";

const assetId = "bdf94c73-f69e-4f55-9e49-ce5d628b10ec";

it("preserves nested images through normalization and duplication without copying the resource", () => {
  const image = createImageBlock({
    id: assetId,
    width: 600,
    height: 800,
    name: "Portrait",
  });
  const document = createDefaultResumeDocument();
  document.sections[0].blocks = [{ id: "row", type: "row", children: [image] }];
  const normalized = normalizeResumeDocumentStructure(document);
  const parsed = validateResumeDocument(normalized);
  expect(parsed.schemaVersion).toBe(2);
  expect(collectImageAssetIds(parsed)).toEqual([assetId]);
  const copy = cloneBlockWithFreshIds(image);
  expect(copy.id).not.toBe(image.id);
  expect(copy).toMatchObject({
    type: "image",
    assetId,
    intrinsicWidth: 600,
    intrinsicHeight: 800,
  });
  expect(parsed.sections[0].blocks[0]).toMatchObject({
    type: "row",
    children: [image],
  });
});

it("keeps legacy text documents readable and rejects unknown versions and unsafe image parameters", () => {
  const document = createDefaultResumeDocument();
  expect(validateResumeDocument(document)).toEqual(document);
  expect(() =>
    validateResumeDocument({ ...document, schemaVersion: 999 }),
  ).toThrow();
  const image = createImageBlock({
    id: assetId,
    width: 600,
    height: 800,
    name: "Portrait",
  });
  for (const change of [
    { assetId: "../secret" },
    { width: -1 },
    { positionX: 101 },
    { intrinsicWidth: 0 },
  ]) {
    expect(() =>
      validateResumeDocument({
        ...document,
        schemaVersion: 2,
        sections: [
          { ...document.sections[0], blocks: [{ ...image, ...change }] },
        ],
      }),
    ).toThrow();
  }
});
