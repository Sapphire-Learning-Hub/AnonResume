import { resolveBlockMoveFromDrag } from "@/components/resume/block-dnd";

describe("resolveBlockMoveFromDrag", () => {
  it("maps a nested same-parent drag into moveBlock parameters", () => {
    expect(
      resolveBlockMoveFromDrag({
        sectionId: "section-experience",
        parentPath: ["group-experience-anonresume"],
        childIds: [
          "row-experience-header",
          "text-experience-context",
          "list-experience-highlights",
        ],
        activeId: "text-experience-context",
        overId: "row-experience-header",
      }),
    ).toEqual({
      sectionId: "section-experience",
      blockPath: [
        "group-experience-anonresume",
        "text-experience-context",
      ],
      toIndex: 0,
    });
  });
});
