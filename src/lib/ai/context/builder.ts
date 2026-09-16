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
  contentHash: string;
}

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

function contextSection(section: ResumeSection): AiContextSection {
  const content = {
    id: section.id,
    semantic: section.semantic,
    title: section.title,
    blocks: section.blocks.map(contextBlock),
  };
  return { ...content, contentHash: hashAiContent(content) };
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
