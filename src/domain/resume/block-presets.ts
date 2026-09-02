import {
  defaultLocale,
  getMessages,
  type AppLocale,
  type MessageKey,
} from "@/i18n/messages";

import { createRichTextFromPlainText } from "./operations";
import type { ResumeBlock, ResumeListItem } from "./schema";

export const blockPresetIds = [
  "text",
  "badges",
  "list",
  "group",
  "row",
] as const;

export type BlockPresetId = (typeof blockPresetIds)[number];

export interface BlockPresetDefinition {
  id: BlockPresetId;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}

const blockPresetDefinitions: readonly BlockPresetDefinition[] = [
  {
    id: "text",
    labelKey: "editor.blockPreset.text",
    descriptionKey: "editor.blockPreset.textDescription",
  },
  {
    id: "badges",
    labelKey: "editor.blockPreset.badges",
    descriptionKey: "editor.blockPreset.badgesDescription",
  },
  {
    id: "list",
    labelKey: "editor.blockPreset.list",
    descriptionKey: "editor.blockPreset.listDescription",
  },
  {
    id: "group",
    labelKey: "editor.blockPreset.group",
    descriptionKey: "editor.blockPreset.groupDescription",
  },
  {
    id: "row",
    labelKey: "editor.blockPreset.row",
    descriptionKey: "editor.blockPreset.rowDescription",
  },
];

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createTextBlock(text: string): ResumeBlock {
  return {
    id: createId("text"),
    type: "text",
    content: createRichTextFromPlainText(text),
  };
}

function createTextListItem(text: string): ResumeListItem {
  return {
    id: createId("item"),
    children: [createTextBlock(text)],
  };
}

export function listBlockPresets(
  locale: AppLocale = defaultLocale,
): BlockPresetDefinition[] {
  void locale;
  return blockPresetDefinitions.map((preset) => ({ ...preset }));
}

export function createBlockFromPreset(
  presetId: BlockPresetId,
  locale: AppLocale = defaultLocale,
): ResumeBlock {
  const messages = getMessages(locale);
  const starterText = messages["editor.blockPreset.starterText"];

  switch (presetId) {
    case "text":
      return createTextBlock(starterText);
    case "badges":
      return {
        id: createId("badges"),
        type: "badges",
        wrap: true,
        gap: 8,
        items: [
          {
            id: createId("badge"),
            text: messages["editor.blockPreset.newBadge"],
          },
        ],
      };
    case "list":
      return {
        id: createId("list"),
        type: "list",
        marker: "disc",
        gap: 6,
        items: [createTextListItem(messages["editor.blockPreset.listItem"])],
      };
    case "group":
      return {
        id: createId("group"),
        type: "group",
        direction: "vertical",
        gap: 8,
        children: [createTextBlock(starterText)],
      };
    case "row":
      return {
        id: createId("row"),
        type: "row",
        gap: 16,
        align: "start",
        justify: "between",
        children: [
          createTextBlock(messages["editor.blockPreset.leftColumn"]),
          createTextBlock(messages["editor.blockPreset.rightColumn"]),
        ],
      };
  }
}
