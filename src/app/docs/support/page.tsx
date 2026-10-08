import SupportEnglish from "@/content/docs/support.en-US.mdx";
import SupportChinese from "@/content/docs/support.zh-CN.mdx";
import { SupportActions } from "@/components/docs/SupportActions";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getDocsRuntimeConfiguration } from "@/lib/docs/runtime";
import { resolvePublicInformationDestinations } from "@/lib/public-info/destinations";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": SupportEnglish, "zh-CN": SupportChinese },
  eyebrowKey: "docs.support.eyebrow",
  leadKey: "docs.support.lead",
  pathname: "/docs/support",
  sections: [
    { id: "before-contacting", labelKey: "docs.support.section.before" },
    { id: "prepare-feedback", labelKey: "docs.support.section.prepare" },
    { id: "protect-information", labelKey: "docs.support.section.privacy" },
  ],
  titleKey: "docs.support.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default async function SupportHelpPage() {
  const [locale, runtimeConfig] = await Promise.all([
    getRequestLocale(),
    getDocsRuntimeConfiguration(),
  ]);
  const messages = getMessages(locale);
  const destination = resolvePublicInformationDestinations(runtimeConfig).support;

  return renderHelpArticle(definition, {
    afterContent: (
      <SupportActions
        destination={destination}
        labels={{
          contactAdministrator: messages["docs.support.contactAdministrator"],
          openSupport: messages["docs.support.openSupport"],
          troubleshooting: messages["docs.support.troubleshooting"],
        }}
      />
    ),
    runtimeConfig,
  });
}
