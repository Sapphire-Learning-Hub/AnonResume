import type { Metadata } from "next";
import Link from "next/link";

import { DocsArticleLayout } from "@/components/docs/DocsArticleLayout";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getAdjacentDocsEntries, getVisibleDocsEntries } from "@/lib/docs/catalog";
import { getDocsRuntimeConfiguration } from "@/lib/docs/runtime";

export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());

  return {
    title: messages["docs.index.title"],
    description: messages["docs.metaDescription"],
  };
}

export default async function DocsPage() {
  const [locale, runtimeConfig] = await Promise.all([
    getRequestLocale(),
    getDocsRuntimeConfiguration(),
  ]);
  const messages = getMessages(locale);
  const entries = getVisibleDocsEntries(runtimeConfig.aiEnabled).filter(
    (entry) => entry.id !== "home",
  );
  const adjacent = getAdjacentDocsEntries("/docs", runtimeConfig.aiEnabled);

  return (
    <DocsArticleLayout
      breadcrumbLabel={messages["docs.breadcrumb"]}
      currentLabel={messages["docs.index.title"]}
      isRoot
      nextLabel={messages["docs.next"]}
      nextPage={{
        href: adjacent.next?.href ?? "/docs/editor",
        label: adjacent.next
          ? messages[adjacent.next.titleKey]
          : messages["docs.navigation.editor"],
      }}
      paginationLabel={messages["docs.pagination"]}
      previousLabel={messages["docs.previous"]}
      rootLabel={messages["docs.navigation.home"]}
      toc={[
        {
          href: "#find-help",
          label: messages["docs.index.section.tasks"],
        },
      ]}
      tocLabel={messages["docs.onThisPage"]}
    >
      <div data-style-scope="docs-prose">
        <p data-docs-eyebrow>{messages["docs.index.eyebrow"]}</p>
        <h1>{messages["docs.index.title"]}</h1>
        <p data-docs-lead>{messages["docs.index.lead"]}</p>
        <h2 id="find-help">{messages["docs.index.section.tasks"]}</h2>
        <div data-docs-task-grid>
          {entries.map((entry) => (
            <Link data-docs-task-card href={entry.href} key={entry.id}>
              <strong>{messages[entry.titleKey]}</strong>
              <span>{messages[entry.summaryKey]}</span>
            </Link>
          ))}
        </div>
      </div>
    </DocsArticleLayout>
  );
}
