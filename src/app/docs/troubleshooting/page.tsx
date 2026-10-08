import TroubleshootingEnglish from "@/content/docs/troubleshooting.en-US.mdx";
import TroubleshootingChinese from "@/content/docs/troubleshooting.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: {
    "en-US": TroubleshootingEnglish,
    "zh-CN": TroubleshootingChinese,
  },
  eyebrowKey: "docs.troubleshooting.eyebrow",
  leadKey: "docs.troubleshooting.lead",
  pathname: "/docs/troubleshooting",
  sections: [
    { id: "editing-saving", labelKey: "docs.troubleshooting.section.editing" },
    { id: "preview-export", labelKey: "docs.troubleshooting.section.output" },
    { id: "access-ai", labelKey: "docs.troubleshooting.section.access" },
    { id: "still-need-help", labelKey: "docs.troubleshooting.section.next" },
  ],
  titleKey: "docs.troubleshooting.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function TroubleshootingHelpPage() {
  return renderHelpArticle(definition);
}
