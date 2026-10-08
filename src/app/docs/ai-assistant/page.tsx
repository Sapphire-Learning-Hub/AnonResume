import { redirect } from "next/navigation";

import AiEnglish from "@/content/docs/ai-assistant.en-US.mdx";
import AiChinese from "@/content/docs/ai-assistant.zh-CN.mdx";
import { getDocsRuntimeConfiguration } from "@/lib/docs/runtime";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": AiEnglish, "zh-CN": AiChinese },
  eyebrowKey: "docs.aiAssistant.eyebrow",
  leadKey: "docs.aiAssistant.lead",
  pathname: "/docs/ai-assistant",
  sections: [
    { id: "start-request", labelKey: "docs.aiAssistant.section.start" },
    { id: "review-result", labelKey: "docs.aiAssistant.section.review" },
    { id: "request-problems", labelKey: "docs.aiAssistant.section.problems" },
  ],
  titleKey: "docs.aiAssistant.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default async function AiAssistantHelpPage() {
  const runtimeConfig = await getDocsRuntimeConfiguration();
  if (!runtimeConfig.aiEnabled) redirect("/docs");

  return renderHelpArticle(definition, { runtimeConfig });
}
