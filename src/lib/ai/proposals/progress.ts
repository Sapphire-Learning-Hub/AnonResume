import type { AiResumeChange } from "@/domain/resume/ai/proposal-schema";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import type { ResumeBlock } from "@/domain/resume/schema";
import type { AiProposalProgressChange } from "@/lib/ai/runs/stream-events";

function blockPreview(block: ResumeBlock): string | null {
  switch (block.type) {
    case "text":
      return getPlainTextFromRichText(block.content);
    case "badges":
      return block.items.map((item) => item.text).join(" · ");
    case "list":
      return block.items
        .flatMap((item) => item.children.map(blockPreview))
        .filter((value): value is string => Boolean(value))
        .join("\n");
    case "group":
    case "row":
      return block.children
        .map(blockPreview)
        .filter((value): value is string => Boolean(value))
        .join("\n");
  }
}

export function createAiProposalProgressChanges(
  changes: AiResumeChange[],
): AiProposalProgressChange[] {
  return changes.map((change) => {
    let preview: string | null = null;
    if ("content" in change) {
      preview = getPlainTextFromRichText(change.content);
    } else if (change.type === "create_section") {
      preview = change.section.title
        ? getPlainTextFromRichText(change.section.title)
        : null;
    } else if (change.type === "insert_block") {
      preview = blockPreview(change.block);
    }

    return {
      id: change.id,
      type: change.type,
      reason: change.reason,
      preview,
    };
  });
}
