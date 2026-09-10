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

export const resumeTemplateCollectionIds = [
  "all",
  "recommended",
  "minimal",
  "classic",
  "structured",
  "compact",
] as const;

export type ResumeTemplateCollectionId =
  (typeof resumeTemplateCollectionIds)[number];

type AssignedResumeTemplateCollectionId = Exclude<
  ResumeTemplateCollectionId,
  "all"
>;

interface ResumeTemplateDefinition {
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  collectionIds: readonly AssignedResumeTemplateCollectionId[];
  searchKeywords: Record<AppLocale, readonly string[]>;
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
    collectionIds: ["minimal"],
    searchKeywords: {
      "zh-CN": ["空白", "基础", "自定义", "从零开始"],
      "en-US": ["blank", "basic", "custom", "start from scratch"],
    },
    createDocument: createBlankResumeDocument,
  },
  centered: {
    nameKey: "dashboard.template.centered.name",
    descriptionKey: "dashboard.template.centered.description",
    collectionIds: ["recommended", "minimal"],
    searchKeywords: {
      "zh-CN": ["居中", "简约", "个人品牌", "创意", "叙事"],
      "en-US": ["centered", "minimal", "personal brand", "creative", "narrative"],
    },
    createDocument: createCenteredResumeDocument,
  },
  classic: {
    nameKey: "dashboard.template.classic.name",
    descriptionKey: "dashboard.template.classic.description",
    collectionIds: ["recommended", "classic"],
    searchKeywords: {
      "zh-CN": ["经典", "商务", "通用", "管理", "留白"],
      "en-US": ["classic", "business", "general", "management", "whitespace"],
    },
    createDocument: createClassicResumeDocument,
  },
  modular: {
    nameKey: "dashboard.template.modular.name",
    descriptionKey: "dashboard.template.modular.description",
    collectionIds: ["recommended", "structured"],
    searchKeywords: {
      "zh-CN": ["双列", "模块", "技术", "结构化", "技能"],
      "en-US": ["two-column", "modular", "technical", "structured", "skills"],
    },
    createDocument: createModularResumeDocument,
  },
  compact: {
    nameKey: "dashboard.template.compact.name",
    descriptionKey: "dashboard.template.compact.description",
    collectionIds: ["compact"],
    searchKeywords: {
      "zh-CN": ["紧凑", "单页", "高密度", "资深", "经历丰富"],
      "en-US": ["compact", "single page", "dense", "senior", "experienced"],
    },
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
  collectionIds: readonly AssignedResumeTemplateCollectionId[];
  searchKeywords: readonly string[];
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
      collectionIds: definition.collectionIds,
      searchKeywords: definition.searchKeywords[locale],
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
