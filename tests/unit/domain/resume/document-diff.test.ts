import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { compareResumeDocuments } from "@/domain/resume/document-diff";

describe("compareResumeDocuments", () => {
  it("groups semantic content and appearance changes by stable node ids", () => {
    const cloud = createDefaultResumeDocument();
    const local = structuredClone(cloud);

    local.meta.title = "Local resume title";
    local.settings.typography.lineHeight = 1.6;
    local.sections[0]!.visible = false;
    local.sections = [local.sections[1]!, local.sections[0]!];

    const result = compareResumeDocuments(cloud, local);

    expect(result.summary).toMatchObject({
      content: 3,
      appearance: 2,
      moved: 2,
      total: 5,
    });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "content",
          kind: "changed",
          nodeId: "document",
          field: "title",
          cloudValue: cloud.meta.title,
          localValue: "Local resume title",
        }),
        expect.objectContaining({
          category: "appearance",
          kind: "changed",
          nodeId: "document",
          field: "typography.lineHeight",
          cloudValue: "1.45",
          localValue: "1.6",
        }),
        expect.objectContaining({
          category: "appearance",
          kind: "changed",
          nodeId: "section-profile",
          field: "visible",
        }),
        expect.objectContaining({
          category: "content",
          kind: "moved",
          nodeId: "section-profile",
        }),
      ]),
    );
  });

  it("tracks list item text edits without storing pagination state", () => {
    const cloud = createDefaultResumeDocument();
    const local = structuredClone(cloud);
    const firstList = local.sections[0]!.blocks.find(
      (block) => block.type === "list",
    );

    if (!firstList || firstList.type !== "list") {
      throw new Error("default list block missing");
    }

    const textBlock = firstList.items[0]!.children[0];

    if (!textBlock || textBlock.type !== "text") {
      throw new Error("default list item text missing");
    }

    textBlock.content.content[0]!.content = [
      { type: "text", text: "Locally edited bullet" },
    ];

    const result = compareResumeDocuments(cloud, local);

    expect(result.changes).toEqual([
      expect.objectContaining({
        category: "content",
        kind: "changed",
        nodeId: textBlock.id,
        field: "text",
        localValue: "Locally edited bullet",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("pagination");
  });

  it("reports a per-section title color as a section appearance change", () => {
    const cloud = createDefaultResumeDocument();
    const local = structuredClone(cloud);
    Object.assign(local.sections[0]!, {
      titleStyle: { color: "#be123c" },
    });

    expect(compareResumeDocuments(cloud, local).changes).toEqual([
      expect.objectContaining({
        category: "appearance",
        kind: "changed",
        nodeId: "section-profile",
        field: "titleStyle.color",
        localValue: "#be123c",
      }),
    ]);
  });
});
