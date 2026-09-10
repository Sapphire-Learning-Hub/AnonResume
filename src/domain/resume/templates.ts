import { createDefaultResumeDocument } from "./default-document";
import { createRichTextFromPlainText } from "./operations";
import type { ResumeDocument } from "./schema";
import {
  createCenteredResumeDocument,
  createClassicResumeDocument,
  createCompactResumeDocument,
  createModularResumeDocument,
} from "./visual-template-documents";
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

const templateDefinitions = {
  blank: {
    nameKey: "dashboard.template.blank.name",
    descriptionKey: "dashboard.template.blank.description",
    createDocument: createBlankResumeDocument,
  },
  centered: {
    nameKey: "dashboard.template.centered.name",
    descriptionKey: "dashboard.template.centered.description",
    createDocument: createCenteredResumeDocument,
  },
  classic: {
    nameKey: "dashboard.template.classic.name",
    descriptionKey: "dashboard.template.classic.description",
    createDocument: createClassicResumeDocument,
  },
  modular: {
    nameKey: "dashboard.template.modular.name",
    descriptionKey: "dashboard.template.modular.description",
    createDocument: createModularResumeDocument,
  },
  compact: {
    nameKey: "dashboard.template.compact.name",
    descriptionKey: "dashboard.template.compact.description",
    createDocument: createCompactResumeDocument,
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
