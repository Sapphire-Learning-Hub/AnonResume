import type { ReactNode } from "react";

import { DocsShell } from "@/components/docs/DocsShell";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getDocsViewerContext } from "@/lib/auth/docs-context";

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const [locale, viewer] = await Promise.all([
    getRequestLocale(),
    getDocsViewerContext(),
  ]);
  const messages = getMessages(locale);

  return (
    <DocsShell
      labels={{
        backHome: messages["docs.backHome"],
        documentGuide: messages["docs.documentGuide"],
        guideSection: messages["docs.navigation.guides"],
        home: messages["docs.navigation.home"],
        navigation: messages["docs.navigation"],
        noResults: messages["docs.search.noResults"],
        productArea: messages["docs.productArea"],
        publicAppearance: messages["docs.navigation.publicAppearance"],
        search: messages["docs.search"],
        signIn: messages["common.signIn"],
        siteTitle: messages["docs.siteTitle"],
        superAdmin: messages["management.superAdmin"],
        switchLocale: messages["docs.switchLocale"],
      }}
      viewer={viewer}
    >
      {children}
    </DocsShell>
  );
}
