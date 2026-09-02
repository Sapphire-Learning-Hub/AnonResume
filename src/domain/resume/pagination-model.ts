export type MeasuredResumeNodeType =
  | "text"
  | "badges"
  | "row"
  | "group"
  | "list"
  | "listItem";

export interface MeasuredResumeNode {
  id: string;
  path: string[];
  type: MeasuredResumeNodeType;
  height: number;
  partial?: boolean;
  direction?: "vertical" | "horizontal";
  childGap?: number;
  wrapperHeight?: number;
  children?: MeasuredResumeNode[];
  continuation?: boolean;
}

export interface ResumePageFragment {
  path: string[];
  children?: ResumePageFragment[];
  continuation?: boolean;
}

export function pathsEqual(current: string[], target: string[]) {
  return (
    current.length === target.length &&
    current.every((segment, index) => segment === target[index])
  );
}

export function cloneMeasuredNode(
  node: MeasuredResumeNode,
): MeasuredResumeNode {
  return {
    ...node,
    path: [...node.path],
    children: node.children?.map(cloneMeasuredNode),
  };
}

export function createWholeFragment(
  node: MeasuredResumeNode,
): ResumePageFragment {
  return {
    path: [...node.path],
    ...(node.partial && node.children?.length
      ? { children: node.children.map(createWholeFragment) }
      : {}),
    ...(node.continuation ? { continuation: true } : {}),
  };
}

function getChildGap(node: MeasuredResumeNode) {
  return node.childGap ?? 0;
}

export function calculateMeasuredChildrenHeight(
  node: MeasuredResumeNode,
  children: MeasuredResumeNode[] = node.children ?? [],
) {
  const childGap = getChildGap(node);

  return (
    (node.wrapperHeight ?? 0) +
    children.reduce(
      (total, child, index) =>
        total + child.height + (index > 0 ? childGap : 0),
      0,
    )
  );
}

export function calculateFragmentHeight(
  node: MeasuredResumeNode,
  fragment: ResumePageFragment,
): number {
  if (!fragment.children?.length || !node.children?.length) {
    return node.height;
  }

  const childGap = getChildGap(node);

  return (
    (node.wrapperHeight ?? 0) +
    fragment.children.reduce((total, childFragment, index) => {
      const childNode = node.children?.find((child) =>
        pathsEqual(child.path, childFragment.path),
      );

      if (!childNode) {
        return total;
      }

      return (
        total +
        calculateFragmentHeight(childNode, childFragment) +
        (index > 0 ? childGap : 0)
      );
    }, 0)
  );
}
