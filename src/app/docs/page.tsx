import type { Metadata } from "next";

import { DocsArticleLayout } from "@/components/docs/DocsArticleLayout";
import IndexEnglish from "@/content/docs/index.en-US.mdx";
import IndexChinese from "@/content/docs/index.zh-CN.mdx";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());

  return {
    title: messages["docs.index.title"],
    description: messages["docs.metaDescription"],
  };
}

export default async function DocsPage() {
  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  const Content = locale === "en-US" ? IndexEnglish : IndexChinese;

  return (
    <DocsArticleLayout
      breadcrumbLabel={messages["docs.breadcrumb"]}
      currentLabel={messages["docs.index.title"]}
      isRoot
      nextLabel={messages["docs.next"]}
      nextPage={{
        href: "/docs/public-resume-customization",
        label: messages["docs.navigation.publicAppearance"],
      }}
      paginationLabel={messages["docs.pagination"]}
      previousLabel={messages["docs.previous"]}
      rootLabel={messages["docs.navigation.home"]}
      toc={[
        {
          href: "#create-share-link",
          label: messages["docs.index.section.publicLinks"],
        },
        {
          href: "#preview-and-share",
          label: messages["docs.index.section.sharing"],
        },
      ]}
      tocLabel={messages["docs.onThisPage"]}
    >
      <div data-style-scope="docs-prose">
        <p data-docs-eyebrow>{messages["docs.index.eyebrow"]}</p>
        <h1>{messages["docs.index.title"]}</h1>
        <p data-docs-lead>{messages["docs.index.lead"]}</p>
        <Content />
      </div>
    </DocsArticleLayout>
  );
}
