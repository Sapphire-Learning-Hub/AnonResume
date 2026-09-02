import { defaultLocale, getMessages, type AppLocale } from "@/i18n/messages";

import type { ResumeSection, RichTextContent } from "./schema";

export type SectionPresetId =
  | "custom"
  | "experience"
  | "projects"
  | "education"
  | "skills";

export interface SectionPresetDefinition {
  id: SectionPresetId;
  label: string;
  semantic?: string;
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function richText(text: string): RichTextContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function createListItemTextBlock(id: string, text: string) {
  return {
    id,
    type: "text" as const,
    content: richText(text),
  };
}

function createTextListItem(text: string) {
  const itemId = createId("item");

  return {
    id: itemId,
    children: [createListItemTextBlock(createId("text"), text)],
  };
}

function createSectionPresetDefinitions(
  locale: AppLocale,
): SectionPresetDefinition[] {
  const messages = getMessages(locale);

  return [
    {
      id: "custom",
      label: messages["preset.custom"],
    },
    {
      id: "experience",
      label: messages["preset.experience"],
      semantic: "experience",
    },
    {
      id: "projects",
      label: messages["preset.projects"],
      semantic: "project",
    },
    {
      id: "education",
      label: messages["preset.education"],
      semantic: "education",
    },
    {
      id: "skills",
      label: messages["preset.skills"],
      semantic: "skills",
    },
  ];
}

export function listSectionPresets(
  locale: AppLocale = defaultLocale,
): SectionPresetDefinition[] {
  return createSectionPresetDefinitions(locale).map((preset) => ({ ...preset }));
}

export function createSectionFromPreset(
  presetId: SectionPresetId,
  locale: AppLocale = defaultLocale,
): ResumeSection {
  const messages = getMessages(locale);

  switch (presetId) {
    case "custom":
      return {
        id: createId("section"),
        title: richText(messages["preset.newSection"]),
        visible: true,
        layout: {
          direction: "vertical",
          gap: 12,
        },
        pagination: {
          keepTogether: true,
        },
        blocks: [
          {
            id: createId("block"),
            type: "text",
            content: richText(messages["preset.startWritingHere"]),
          },
        ],
      };
    case "experience":
      return {
        id: createId("section"),
        title: richText(messages["preset.experience"]),
        semantic: "experience",
        visible: true,
        layout: {
          direction: "vertical",
          gap: 14,
        },
        pagination: {
          keepTogether: true,
        },
        blocks: [
          {
            id: createId("group"),
            type: "group",
            direction: "vertical",
            gap: 10,
            children: [
              {
                id: createId("row"),
                type: "row",
                gap: 16,
                align: "start",
                justify: "between",
                children: [
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.roleCompany"]),
                    style: {
                      fontSize: 16,
                      fontWeight: 700,
                    },
                  },
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.present"]),
                    style: {
                      color: "#475569",
                    },
                  },
                ],
              },
              {
                id: createId("text"),
                type: "text",
                content: richText(messages["preset.experienceContext"]),
                style: {
                  color: "#475569",
                },
              },
              {
                id: createId("list"),
                type: "list",
                marker: "disc",
                gap: 8,
                items: [
                  createTextListItem(messages["preset.experienceBullet1"]),
                  createTextListItem(messages["preset.experienceBullet2"]),
                ],
              },
            ],
          },
        ],
      };
    case "projects":
      return {
        id: createId("section"),
        title: richText(messages["preset.projects"]),
        semantic: "project",
        visible: true,
        layout: {
          direction: "vertical",
          gap: 14,
        },
        pagination: {
          keepTogether: true,
        },
        blocks: [
          {
            id: createId("group"),
            type: "group",
            direction: "vertical",
            gap: 10,
            children: [
              {
                id: createId("row"),
                type: "row",
                gap: 16,
                align: "start",
                justify: "between",
                children: [
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.projectName"]),
                    style: {
                      fontSize: 16,
                      fontWeight: 700,
                    },
                  },
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.projectYear"]),
                    style: {
                      color: "#475569",
                    },
                  },
                ],
              },
              {
                id: createId("text"),
                type: "text",
                content: richText(messages["preset.projectContext"]),
                style: {
                  color: "#475569",
                },
              },
              {
                id: createId("list"),
                type: "list",
                marker: "disc",
                gap: 8,
                items: [
                  createTextListItem(messages["preset.projectHighlight1"]),
                  createTextListItem(messages["preset.projectHighlight2"]),
                ],
              },
            ],
          },
        ],
      };
    case "education":
      return {
        id: createId("section"),
        title: richText(messages["preset.education"]),
        semantic: "education",
        visible: true,
        layout: {
          direction: "vertical",
          gap: 14,
        },
        pagination: {
          keepTogether: true,
        },
        blocks: [
          {
            id: createId("group"),
            type: "group",
            direction: "vertical",
            gap: 10,
            children: [
              {
                id: createId("row"),
                type: "row",
                gap: 16,
                align: "start",
                justify: "between",
                children: [
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.educationSchool"]),
                    style: {
                      fontSize: 16,
                      fontWeight: 700,
                    },
                  },
                  {
                    id: createId("text"),
                    type: "text",
                    content: richText(messages["preset.educationYear"]),
                    style: {
                      color: "#475569",
                    },
                  },
                ],
              },
              {
                id: createId("text"),
                type: "text",
                content: richText(messages["preset.educationDetail"]),
                style: {
                  color: "#475569",
                },
              },
            ],
          },
        ],
      };
    case "skills":
      return {
        id: createId("section"),
        title: richText(messages["preset.skills"]),
        semantic: "skills",
        visible: true,
        layout: {
          direction: "vertical",
          gap: 12,
        },
        pagination: {
          keepTogether: true,
        },
        blocks: [
          {
            id: createId("text"),
            type: "text",
            content: richText(messages["preset.coreStack"]),
            style: {
              fontSize: 16,
              fontWeight: 700,
            },
          },
          {
            id: createId("badges"),
            type: "badges",
            wrap: true,
            gap: 8,
            items: [
              { id: createId("badge"), text: "TypeScript" },
              { id: createId("badge"), text: "React" },
              { id: createId("badge"), text: "Next.js" },
              { id: createId("badge"), text: "Node.js" },
            ],
          },
        ],
      };
  }
}
