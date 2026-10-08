import type { Metadata } from "next";

import { DocsArticleLayout } from "@/components/docs/DocsArticleLayout";
import { PublicAppearanceReference } from "@/components/docs/PublicAppearanceReference";
import { PublicResumeUrlBuilder } from "@/components/docs/PublicResumeUrlBuilder";
import CustomizationEnglish from "@/content/docs/public-resume-customization.en-US.mdx";
import CustomizationChinese from "@/content/docs/public-resume-customization.zh-CN.mdx";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getDocsViewerContext } from "@/lib/auth/docs-context";
import { getAdjacentDocsEntries } from "@/lib/docs/catalog";
import { getDocsRuntimeConfiguration } from "@/lib/docs/runtime";

export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());

  return {
    title: messages["docs.appearance.title"],
    description: messages["docs.appearance.lead"],
  };
}

export default async function PublicResumeCustomizationPage() {
  const [locale, viewer, runtimeConfig] = await Promise.all([
    getRequestLocale(),
    getDocsViewerContext(),
    getDocsRuntimeConfiguration(),
  ]);
  const messages = getMessages(locale);
  const Content =
    locale === "en-US" ? CustomizationEnglish : CustomizationChinese;
  const adjacent = getAdjacentDocsEntries(
    "/docs/public-resume-customization",
    runtimeConfig.aiEnabled,
  );

  return (
    <DocsArticleLayout
      breadcrumbLabel={messages["docs.breadcrumb"]}
      currentLabel={messages["docs.appearance.title"]}
      nextLabel={messages["docs.next"]}
      nextPage={
        adjacent.next
          ? {
              href: adjacent.next.href,
              label: messages[adjacent.next.titleKey],
            }
          : undefined
      }
      paginationLabel={messages["docs.pagination"]}
      previousLabel={messages["docs.previous"]}
      previousPage={
        adjacent.previous
          ? {
              href: adjacent.previous.href,
              label: messages[adjacent.previous.titleKey],
            }
          : undefined
      }
      rootLabel={messages["docs.navigation.home"]}
      toc={[
        {
          href: "#get-started",
          label: messages["docs.appearance.section.usage"],
        },
        {
          href: "#adjust-appearance",
          label: messages["docs.appearance.section.colors"],
        },
        {
          href: "#preview-and-share",
          label: messages["docs.appearance.section.sharing"],
        },
        {
          href: "#url-builder-title",
          label: messages["docs.builder.title"],
        },
      ]}
      tocLabel={messages["docs.onThisPage"]}
    >
      <div data-style-scope="docs-prose">
        <p data-docs-eyebrow>{messages["docs.appearance.eyebrow"]}</p>
        <h1>{messages["docs.appearance.title"]}</h1>
        <p data-docs-lead>{messages["docs.appearance.lead"]}</p>
        <Content />
      </div>
      <PublicResumeUrlBuilder
        viewerMode={
          viewer ? (viewer.managementOnly ? "super-admin" : "product") : "signed-out"
        }
      />
      <PublicAppearanceReference />
    </DocsArticleLayout>
  );
}
