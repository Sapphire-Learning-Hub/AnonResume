import { createDefaultResumeDocument } from "./default-document";
import { createRichTextFromPlainText } from "./operations";
import type { ResumeDocument } from "./schema";
import {
  defaultLocale,
  getMessages,
  type AppLocale,
  type MessageKey,
} from "@/i18n/messages";

interface ResumeTemplateDefinition {
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  createDocument: (locale: AppLocale) => ResumeDocument;
}

const blankContent: Record<
  AppLocale,
  {
    personalInformationTitle: string;
    personalInformationPlaceholder: string;
    workExperienceTitle: string;
    workExperiencePlaceholder: string;
  }
> = {
  "zh-CN": {
    personalInformationTitle: "个人信息",
    personalInformationPlaceholder: "姓名 · 求职方向",
    workExperienceTitle: "工作经历",
    workExperiencePlaceholder: "公司 · 职位 · 时间",
  },
  "en-US": {
    personalInformationTitle: "Personal information",
    personalInformationPlaceholder: "Name · Target role",
    workExperienceTitle: "Work experience",
    workExperiencePlaceholder: "Company · Role · Dates",
  },
};

function createBlankResumeDocument(locale: AppLocale): ResumeDocument {
  const messages = getMessages(locale);
  const content = blankContent[locale];
  const document = createDefaultResumeDocument(locale);

  document.meta.title = messages["catalog.untitledResume"];
  document.sections = [
    {
      id: "section-personal-information",
      title: createRichTextFromPlainText(content.personalInformationTitle),
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
          id: "block-personal-information",
          type: "text",
          content: createRichTextFromPlainText(
            content.personalInformationPlaceholder,
          ),
        },
      ],
    },
    {
      id: "section-work-experience",
      title: createRichTextFromPlainText(content.workExperienceTitle),
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
          id: "block-work-experience",
          type: "text",
          content: createRichTextFromPlainText(content.workExperiencePlaceholder),
        },
      ],
    },
  ];

  return document;
}

function createPopulatedResumeDocument({
  locale,
  titleKey,
  summaryHeadingKey,
  summaryBulletKey,
}: {
  locale: AppLocale;
  titleKey: MessageKey;
  summaryHeadingKey: MessageKey;
  summaryBulletKey: MessageKey;
}): ResumeDocument {
  const messages = getMessages(locale);
  const document = createDefaultResumeDocument(locale);

  document.meta.title = messages[titleKey];

  const profileSection = document.sections.find(
    (section) => section.id === "section-profile",
  );
  const headingBlock = profileSection?.blocks.find(
    (block) => block.id === "block-profile-summary",
  );
  const highlightBlock = profileSection?.blocks.find(
    (block) => block.id === "block-profile-highlights",
  );
  const firstHighlightItem =
    highlightBlock?.type === "list"
      ? highlightBlock.items.find((item) => item.id === "item-foundation-1")
      : undefined;
  const firstHighlightText = firstHighlightItem?.children.find(
    (block) => block.id === "item-foundation-1-text",
  );

  if (
    headingBlock?.type !== "text" ||
    highlightBlock?.type !== "list" ||
    !firstHighlightItem ||
    firstHighlightText?.type !== "text"
  ) {
    throw new Error("Default resume document no longer matches template anchors");
  }

  headingBlock.content = createRichTextFromPlainText(
    messages[summaryHeadingKey],
  );
  firstHighlightText.content = createRichTextFromPlainText(
    messages[summaryBulletKey],
  );

  return document;
}

const templateDefinitions = {
  blank: {
    nameKey: "dashboard.template.blank.name",
    descriptionKey: "dashboard.template.blank.description",
    createDocument: createBlankResumeDocument,
  },
  foundation: {
    nameKey: "dashboard.template.foundation.name",
    descriptionKey: "dashboard.template.foundation.description",
    createDocument: (locale) =>
      createPopulatedResumeDocument({
        locale,
        titleKey: "catalog.foundationTitle",
        summaryHeadingKey: "catalog.foundationHeading",
        summaryBulletKey: "catalog.foundationBullet",
      }),
  },
  frontend: {
    nameKey: "dashboard.template.frontend.name",
    descriptionKey: "dashboard.template.frontend.description",
    createDocument: (locale) =>
      createPopulatedResumeDocument({
        locale,
        titleKey: "catalog.frontendTitle",
        summaryHeadingKey: "catalog.frontendHeading",
        summaryBulletKey: "catalog.frontendBullet",
      }),
  },
  fullstack: {
    nameKey: "dashboard.template.fullstack.name",
    descriptionKey: "dashboard.template.fullstack.description",
    createDocument: (locale) =>
      createPopulatedResumeDocument({
        locale,
        titleKey: "catalog.fullstackTitle",
        summaryHeadingKey: "catalog.fullstackHeading",
        summaryBulletKey: "catalog.fullstackBullet",
      }),
  },
} as const satisfies Record<string, ResumeTemplateDefinition>;

export type ResumeTemplateId = keyof typeof templateDefinitions;

export const resumeTemplateIds = Object.keys(
  templateDefinitions,
) as ResumeTemplateId[];

export interface ResumeTemplate {
  id: ResumeTemplateId;
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  document: ResumeDocument;
}

export function isResumeTemplateId(value: unknown): value is ResumeTemplateId {
  return (
    typeof value === "string" &&
    resumeTemplateIds.includes(value as ResumeTemplateId)
  );
}

export function listResumeTemplates(
  locale: AppLocale = defaultLocale,
): ResumeTemplate[] {
  return resumeTemplateIds.map((id) => {
    const definition = templateDefinitions[id];

    return {
      id,
      nameKey: definition.nameKey,
      descriptionKey: definition.descriptionKey,
      document: definition.createDocument(locale),
    };
  });
}

export function createResumeDocumentFromTemplate(
  id: ResumeTemplateId,
  locale: AppLocale = defaultLocale,
): ResumeDocument {
  return templateDefinitions[id].createDocument(locale);
}
