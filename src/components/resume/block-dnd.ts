export function resolveBlockMoveFromDrag(input: {
  sectionId: string;
  parentPath: string[];
  childIds: string[];
  activeId: string;
  overId?: string;
}) {
  if (!input.overId || input.activeId === input.overId) {
    return undefined;
  }

  const activeIndex = input.childIds.indexOf(input.activeId);
  const overIndex = input.childIds.indexOf(input.overId);

  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
    return undefined;
  }

  return {
    sectionId: input.sectionId,
    blockPath: [...input.parentPath, input.activeId],
    toIndex: overIndex,
  };
}
