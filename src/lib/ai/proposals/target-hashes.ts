import type { AiEditableTarget } from "@/lib/ai/context/builder";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function samePath(value: unknown, expected: string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((part, index) => part === expected[index])
  );
}

function matchesTarget(
  change: Record<string, unknown>,
  target: AiEditableTarget,
) {
  if (
    change.type !== target.type ||
    change.sectionId !== target.sectionId
  ) {
    return false;
  }

  switch (target.type) {
    case "replace_section_title":
      return true;
    case "replace_text":
      return samePath(change.blockPath, target.blockPath);
    case "replace_list_item":
    case "delete_list_item":
      return (
        change.itemId === target.itemId &&
        samePath(change.listPath, target.listPath)
      );
    case "insert_list_item":
      return (
        change.afterItemId === target.afterItemId &&
        samePath(change.listPath, target.listPath)
      );
  }
}

export function attachAiProposalTargetHashes(
  proposal: unknown,
  targets: AiEditableTarget[],
) {
  if (!isRecord(proposal) || !Array.isArray(proposal.changes)) return proposal;

  return {
    ...proposal,
    changes: proposal.changes.map((value) => {
      if (!isRecord(value)) return value;
      const change = { ...value };
      delete change.beforeHash;
      const target = targets.find((candidate) => matchesTarget(change, candidate));
      return target ? { ...change, beforeHash: target.beforeHash } : change;
    }),
  };
}
