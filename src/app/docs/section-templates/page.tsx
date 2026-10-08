import TemplatesEnglish from "@/content/docs/section-templates.en-US.mdx";
import TemplatesChinese from "@/content/docs/section-templates.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": TemplatesEnglish, "zh-CN": TemplatesChinese },
  eyebrowKey: "docs.sectionTemplates.eyebrow",
  leadKey: "docs.sectionTemplates.lead",
  pathname: "/docs/section-templates",
  sections: [
    { id: "choose-template", labelKey: "docs.sectionTemplates.section.choose" },
    { id: "insert-edit", labelKey: "docs.sectionTemplates.section.use" },
    { id: "templates-presets", labelKey: "docs.sectionTemplates.section.difference" },
  ],
  titleKey: "docs.sectionTemplates.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function SectionTemplatesHelpPage() {
  return renderHelpArticle(definition);
}
