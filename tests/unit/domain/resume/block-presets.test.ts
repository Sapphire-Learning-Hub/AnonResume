import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import type { ResumeBlock } from "@/domain/resume/schema";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  blockPresetIds,
  createBlockFromPreset,
  listBlockPresets,
} from "@/domain/resume/block-presets";

function collectIds(block: ResumeBlock): string[] {
  if (block.type === "text") {
    return [block.id];
  }

  if (block.type === "badges") {
    return [block.id, ...block.items.map((item) => item.id)];
  }

  if (block.type === "list") {
    return [
      block.id,
      ...block.items.flatMap((item) => [
        item.id,
        ...item.children.flatMap(collectIds),
      ]),
    ];
  }

  return [block.id, ...block.children.flatMap(collectIds)];
}

describe("resume block presets", () => {
  it("exposes the five reusable component types", () => {
    expect(blockPresetIds).toEqual([
      "text",
      "badges",
      "list",
      "group",
      "row",
    ]);
    expect(listBlockPresets("zh-CN").map((preset) => preset.id)).toEqual(
      blockPresetIds,
    );
  });

  it.each(blockPresetIds)("creates a schema-valid fresh %s block", (presetId) => {
    const first = createBlockFromPreset(presetId, "zh-CN");
    const second = createBlockFromPreset(presetId, "zh-CN");
    const document = createDefaultResumeDocument("zh-CN");

    document.sections[0]!.blocks = [first];

    expect(validateResumeDocument(document)).toEqual(document);
    expect(new Set(collectIds(first)).size).toBe(collectIds(first).length);
    expect(collectIds(first)).not.toEqual(collectIds(second));
  });

  it("localizes starter content without changing component structure", () => {
    const zhText = createBlockFromPreset("text", "zh-CN");
    const enText = createBlockFromPreset("text", "en-US");
    const zhBadges = createBlockFromPreset("badges", "zh-CN");
    const enBadges = createBlockFromPreset("badges", "en-US");

    expect(zhText.type).toBe("text");
    expect(enText.type).toBe("text");
    expect(
      zhText.type === "text" ? getPlainTextFromRichText(zhText.content) : "",
    ).toBe("在这里输入内容");
    expect(
      enText.type === "text" ? getPlainTextFromRichText(enText.content) : "",
    ).toBe("Start writing here");
    expect(zhBadges.type === "badges" ? zhBadges.items[0]?.text : "").toBe(
      "新标签",
    );
    expect(enBadges.type === "badges" ? enBadges.items[0]?.text : "").toBe(
      "New tag",
    );
  });
});
