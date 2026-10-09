import type { Metadata } from "next";
import type { ComponentType, ReactNode } from "react";

import { DocsArticleLayout } from "@/components/docs/DocsArticleLayout";
import { getMessages, type MessageKey } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getAdjacentDocsEntries } from "@/lib/docs/catalog";
import {
  getDocsRuntimeConfiguration,
  type DocsRuntimeConfiguration,
} from "@/lib/docs/runtime";

interface HelpArticleSection {
  id: string;
  labelKey: MessageKey;
}

export interface HelpArticleDefinition {
  content: {
    "en-US": ComponentType;
    "zh-CN": ComponentType;
  };
  eyebrowKey: MessageKey;
  leadKey: MessageKey;
  pathname: `/docs${string}`;
  sections: readonly HelpArticleSection[];
  titleKey: MessageKey;
}

export async function createHelpArticleMetadata(
  definition: HelpArticleDefinition,
): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());
  return {
    description: messages[definition.leadKey],
    title: messages[definition.titleKey],
  };
}

export async function renderHelpArticle(
  definition: HelpArticleDefinition,
  options: {
    afterContent?: ReactNode;
    runtimeConfig?: DocsRuntimeConfiguration;
  } = {},
) {
  const [locale, runtimeConfig] = await Promise.all([
    getRequestLocale(),
    options.runtimeConfig ?? getDocsRuntimeConfiguration(),
  ]);
  const messages = getMessages(locale);
  const Content = definition.content[locale];
  const adjacent = getAdjacentDocsEntries(
    definition.pathname,
    runtimeConfig.aiEnabled,
  );

  return (
    <DocsArticleLayout
      breadcrumbLabel={messages["docs.breadcrumb"]}
      currentLabel={messages[definition.titleKey]}
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
      toc={definition.sections.map((section) => ({
        href: `#${section.id}`,
        label: messages[section.labelKey],
      }))}
      tocLabel={messages["docs.onThisPage"]}
    >
      <div data-style-scope="docs-prose">
        <p data-docs-eyebrow>{messages[definition.eyebrowKey]}</p>
        <h1>{messages[definition.titleKey]}</h1>
        <p data-docs-lead>{messages[definition.leadKey]}</p>
        <Content />
      </div>
      {options.afterContent}
    </DocsArticleLayout>
  );
}
