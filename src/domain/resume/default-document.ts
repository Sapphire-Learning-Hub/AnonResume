import type { RichTextContent, ResumeDocument } from "./schema";
import {
  defaultLocale,
  getMessages,
  type AppLocale,
} from "@/i18n/messages";

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

function createListItemTextBlock(itemId: string, text: string) {
  return {
    id: `${itemId}-text`,
    type: "text" as const,
    content: richText(text),
  };
}

export function createDefaultResumeDocument(
  locale: AppLocale = defaultLocale,
): ResumeDocument {
  const messages = getMessages(locale);

  return {
    schemaVersion: 1,
    meta: {
      title: messages["defaultDocument.title"],
      locale,
    },
    settings: {
      page: {
        size: "A4",
        margin: {
          top: 32,
          right: 32,
          bottom: 32,
          left: 32,
        },
      },
      typography: {
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        baseFontSize: 14,
        lineHeight: 1.45,
      },
      theme: {
        accent: "#0f62fe",
        textColor: "#0f172a",
        mutedColor: "#475569",
      },
    },
    sections: [
      {
        id: "section-profile",
        title: richText(messages["defaultDocument.profileTitle"]),
        semantic: "profile",
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
            id: "block-profile-summary",
            type: "text",
            content: richText(messages["defaultDocument.profileSummary"]),
            style: {
              fontSize: 20,
              fontWeight: 700,
            },
          },
          {
            id: "block-profile-highlights",
            type: "list",
            marker: "disc",
            gap: 8,
            items: [
              {
                id: "item-foundation-1",
                children: [
                  createListItemTextBlock(
                    "item-foundation-1",
                    messages["defaultDocument.profileBullet1"],
                  ),
                ],
              },
              {
                id: "item-foundation-2",
                children: [
                  createListItemTextBlock(
                    "item-foundation-2",
                    messages["defaultDocument.profileBullet2"],
                  ),
                ],
              },
            ],
          },
          {
            id: "block-profile-stack",
            type: "badges",
            wrap: true,
            gap: 8,
            items: [
              { id: "badge-next", text: "Next.js" },
              { id: "badge-react", text: "React" },
              { id: "badge-bun", text: "Bun" },
              { id: "badge-antd", text: "Ant Design" },
            ],
          },
        ],
      },
      {
        id: "section-experience",
        title: richText(messages["defaultDocument.experienceTitle"]),
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
            id: "group-experience-anonresume",
            type: "group",
            direction: "vertical",
            gap: 10,
            children: [
              {
                id: "row-experience-header",
                type: "row",
                gap: 16,
                align: "start",
                justify: "between",
                children: [
                  {
                    id: "text-experience-role",
                    type: "text",
                    content: richText(messages["defaultDocument.experienceRole"]),
                    style: {
                      fontSize: 16,
                      fontWeight: 700,
                    },
                  },
                  {
                    id: "text-experience-range",
                    type: "text",
                    content: richText("2026.01 - 2026.08"),
                    style: {
                      color: "#475569",
                    },
                  },
                ],
              },
              {
                id: "text-experience-context",
                type: "text",
                content: richText(messages["defaultDocument.experienceContext"]),
                style: {
                  color: "#475569",
                },
              },
              {
                id: "list-experience-highlights",
                type: "list",
                marker: "disc",
                gap: 8,
                items: [
                  {
                    id: "item-experience-1",
                    children: [
                      createListItemTextBlock(
                        "item-experience-1",
                        messages["defaultDocument.experienceBullet1"],
                      ),
                    ],
                  },
                  {
                    id: "item-experience-2",
                    children: [
                      createListItemTextBlock(
                        "item-experience-2",
                        messages["defaultDocument.experienceBullet2"],
                      ),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
