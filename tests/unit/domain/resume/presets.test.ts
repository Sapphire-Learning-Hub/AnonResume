import { describe, expect, it } from "vitest";

import { createSectionFromPreset, listSectionPresets } from "@/domain/resume/presets";

describe("resume presets", () => {
  it("lists the supported section presets for quick insert actions", () => {
    expect(listSectionPresets().map((preset) => preset.id)).toEqual([
      "custom",
      "experience",
      "projects",
      "education",
      "skills",
    ]);
  });

  it("creates a structured projects preset section", () => {
    const section = createSectionFromPreset("projects");

    expect(section.semantic).toBe("project");
    expect(section.title?.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "项目",
    });
    expect(section.blocks).toHaveLength(1);
    expect(section.blocks[0]).toMatchObject({
      type: "group",
      direction: "vertical",
    });

    if (section.blocks[0]?.type !== "group") {
      throw new Error("Expected the projects preset to create a group block");
    }

    expect(section.blocks[0].children.map((block) => block.type)).toEqual([
      "row",
      "text",
      "list",
    ]);

    const listBlock = section.blocks[0].children[2];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected the projects preset to end with a list block");
    }

    expect(listBlock.items[0]).toMatchObject({
      children: [
        {
          type: "text",
        },
      ],
    });
  });
});
