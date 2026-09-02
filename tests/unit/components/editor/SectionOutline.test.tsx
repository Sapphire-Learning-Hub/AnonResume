import type { DragEndEvent } from "@dnd-kit/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach } from "vitest";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";

import { SectionOutline } from "@/components/editor/SectionOutline";

const dndContextState: {
  id?: string;
  onDragEnd?: (event: DragEndEvent) => void;
} = {};
const sortableState = {
  draggingId: "",
  overId: "",
};

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");

  return {
    DndContext: ({
      children,
      id,
      onDragEnd,
    }: {
      children: React.ReactNode;
      id?: string;
      onDragEnd?: (event: DragEndEvent) => void;
    }) => {
      dndContextState.id = id;
      dndContextState.onDragEnd = onDragEnd;

      return <div data-testid="dnd-context">{children}</div>;
    },
    closestCenter: vi.fn(),
    KeyboardSensor: class KeyboardSensor {},
    PointerSensor: class PointerSensor {},
    useSensor: vi.fn((sensor: unknown, options?: unknown) => ({
      sensor,
      options,
    })),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
  };
});

vi.mock("@dnd-kit/sortable", async () => {
  const React = await import("react");

  return {
    SortableContext: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="sortable-context">{children}</div>
    ),
    arrayMove: (items: unknown[], fromIndex: number, toIndex: number) => {
      const nextItems = [...items];
      const [movedItem] = nextItems.splice(fromIndex, 1);

      if (movedItem === undefined) {
        return items;
      }

      nextItems.splice(toIndex, 0, movedItem);

      return nextItems;
    },
    useSortable: ({ id }: { id: string }) => ({
      attributes: {
        "data-sortable-id": id,
      },
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: sortableState.draggingId === id,
      isOver: sortableState.overId === id,
      isSorting: false,
    }),
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: {},
  };
});

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

describe("SectionOutline", () => {
  const sections = createDefaultResumeDocument().sections;
  const classNames = {
    outlineList: "outlineList",
    outlineItem: "outlineItem",
    outlineButton: "outlineButton",
    outlineMeta: "outlineMeta",
    compactActionRow: "compactActionRow",
  };

  beforeEach(() => {
    sortableState.draggingId = "";
    sortableState.overId = "";
  });

  it("renders a draggable card for each section item", () => {
    render(
      <SectionOutline
        sections={sections}
        selectedSectionId="section-profile"
        onSelectSection={vi.fn()}
        onMoveSection={vi.fn()}
        classNames={classNames}
      />,
    );

    const profileItem = screen.getByTestId("section-outline-item-section-profile");
    expect(profileItem).toHaveAttribute("role", "group");
    expect(profileItem).toHaveAttribute("aria-label", "拖动排序 个人简介");
    expect(profileItem).toHaveAttribute(
      "data-sortable-id",
      "section-profile",
    );
    expect(profileItem).toHaveAttribute("data-dragging", "false");
    expect(profileItem).toHaveAttribute("data-over", "false");
    expect(within(profileItem).queryByText("个人简介 区块")).not.toBeInTheDocument();
    expect(within(profileItem).queryByText("显示中")).not.toBeInTheDocument();
    expect(
      within(profileItem).getByRole("button", {
        name: "个人简介",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(dndContextState.id).toBe("resume-section-outline");
  });

  it("exposes drag and drop-target state through data attributes", () => {
    sortableState.draggingId = "section-profile";
    sortableState.overId = "section-experience";

    render(
      <SectionOutline
        sections={sections}
        selectedSectionId="section-profile"
        onSelectSection={vi.fn()}
        onMoveSection={vi.fn()}
        classNames={classNames}
      />,
    );

    expect(
      screen.getByTestId("section-outline-item-section-profile"),
    ).toHaveAttribute("data-dragging", "true");
    expect(
      screen.getByTestId("section-outline-item-section-experience"),
    ).toHaveAttribute("data-over", "true");
  });

  it("selects a section without triggering a move when its title is clicked", () => {
    const onSelectSection = vi.fn();
    const onMoveSection = vi.fn();

    render(
      <SectionOutline
        sections={sections}
        selectedSectionId="section-profile"
        onSelectSection={onSelectSection}
        onMoveSection={onMoveSection}
        classNames={classNames}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "经历" }),
    );

    expect(onSelectSection).toHaveBeenCalledWith("section-experience");
    expect(onMoveSection).not.toHaveBeenCalled();
  });

  it("reorders sections when drag ends over a different section", () => {
    const onMoveSection = vi.fn();

    render(
      <SectionOutline
        sections={sections}
        selectedSectionId="section-profile"
        onSelectSection={vi.fn()}
        onMoveSection={onMoveSection}
        classNames={classNames}
      />,
    );

    dndContextState.onDragEnd?.({
      active: { id: "section-experience" },
      over: { id: "section-profile" },
    } as DragEndEvent);

    expect(onMoveSection).toHaveBeenCalledWith({
      sectionId: "section-experience",
      toIndex: 0,
    });
  });
});
