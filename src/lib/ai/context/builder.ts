import type {
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
} from "@/domain/resume/schema";
import { hashAiContent } from "@/domain/resume/ai/content-hash";

interface AiContextBlock {
  id: string;
  type: ResumeBlock["type"];
  content?: unknown;
  items?: unknown[];
  children?: AiContextBlock[];
}

export interface AiContextSection {
  id: string;
  semantic?: string;
  title?: ResumeSection["title"];
  blocks: AiContextBlock[];
  editableTargets: AiEditableTarget[];
  contentHash: string;
}

export type AiEditableTarget =
  | {
      type: "replace_section_title";
      sectionId: string;
      beforeHash: string;
    }
  | {
      type: "replace_text";
      sectionId: string;
      blockPath: string[];
      beforeHash: string;
    }
  | {
      type: "replace_list_item" | "delete_list_item";
      sectionId: string;
      listPath: string[];
      itemId: string;
      beforeHash: string;
    }
  | {
      type: "insert_list_item";
      sectionId: string;
      listPath: string[];
      afterItemId: string;
      beforeHash: string;
    };

export interface AiResumeContext {
  schemaVersion: number;
  locale?: string;
  documentTitle: string;
  sections: AiContextSection[];
}

function contextBlock(block: ResumeBlock): AiContextBlock {
  switch (block.type) {
    case "text":
      return { id: block.id, type: block.type, content: block.content };
    case "badges":
      return {
        id: block.id,
        type: block.type,
        items: block.items.map((item) => ({ id: item.id, text: item.text })),
      };
    case "list":
      return {
        id: block.id,
        type: block.type,
        items: block.items.map((item) => ({
          id: item.id,
          children: item.children.map(contextBlock),
        })),
      };
    case "group":
    case "row":
      return {
        id: block.id,
        type: block.type,
        children: block.children.map(contextBlock),
      };
  }
}

function collectEditableTargets(
  blocks: ResumeBlock[],
  sectionId: string,
  parentPath: string[] = [],
): AiEditableTarget[] {
  return blocks.flatMap((block) => {
    const blockPath = [...parentPath, block.id];
    switch (block.type) {
      case "text":
        return [{
          type: "replace_text" as const,
          sectionId,
          blockPath,
          beforeHash: hashAiContent(block.content),
        }];
      case "list": {
        const listHash = hashAiContent(block.items);
        return block.items.flatMap((item) => [
          {
            type: "replace_list_item" as const,
            sectionId,
            listPath: blockPath,
            itemId: item.id,
            beforeHash: hashAiContent(item),
          },
          {
            type: "delete_list_item" as const,
            sectionId,
            listPath: blockPath,
            itemId: item.id,
            beforeHash: hashAiContent(item),
          },
          {
            type: "insert_list_item" as const,
            sectionId,
            listPath: blockPath,
            afterItemId: item.id,
            beforeHash: listHash,
          },
          ...collectEditableTargets(
            item.children,
            sectionId,
            [...blockPath, item.id],
          ),
        ]);
      }
      case "group":
      case "row":
        return collectEditableTargets(block.children, sectionId, blockPath);
      case "badges":
        return [];
    }
  });
}

function contextSection(section: ResumeSection): AiContextSection {
  const content = {
    id: section.id,
    semantic: section.semantic,
    title: section.title,
    blocks: section.blocks.map(contextBlock),
  };
  return {
    ...content,
    editableTargets: [
      {
        type: "replace_section_title",
        sectionId: section.id,
        beforeHash: hashAiContent(section.title ?? null),
      },
      ...collectEditableTargets(section.blocks, section.id),
    ],
    contentHash: hashAiContent(content),
  };
}

export function buildAiResumeContext({
  document,
  scope,
  sectionId,
}: {
  document: ResumeDocument;
  scope: "resume" | "section";
  sectionId?: string;
}): AiResumeContext {
  const sections =
    scope === "resume"
      ? document.sections
      : document.sections.filter((section) => section.id === sectionId);
  if (scope === "section" && sections.length === 0) {
    throw new Error("ai_context_section_not_found");
  }

  return {
    schemaVersion: document.schemaVersion,
    locale: document.meta.locale,
    documentTitle: document.meta.title,
    sections: sections.map(contextSection),
  };
}

export function createAiContextDelta(
  previous: AiResumeContext,
  current: AiResumeContext,
) {
  const previousById = new Map(
    previous.sections.map((section) => [section.id, section]),
  );
  const currentIds = new Set(current.sections.map((section) => section.id));

  return {
    documentTitle:
      previous.documentTitle === current.documentTitle
        ? undefined
        : current.documentTitle,
    changedSections: current.sections.filter(
      (section) =>
        previousById.get(section.id)?.contentHash !== section.contentHash,
    ),
    removedSectionIds: previous.sections
      .filter((section) => !currentIds.has(section.id))
      .map((section) => section.id),
  };
}
