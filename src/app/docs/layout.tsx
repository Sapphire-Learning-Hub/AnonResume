import type { ReactNode } from "react";

import { DocsShell } from "@/components/docs/DocsShell";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getDocsViewerContext } from "@/lib/auth/docs-context";
import { getVisibleDocsGroups } from "@/lib/docs/catalog";
import { getDocsRuntimeConfiguration } from "@/lib/docs/runtime";
import { resolvePublicInformationDestinations } from "@/lib/public-info/destinations";

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const [locale, viewer, runtimeConfig] = await Promise.all([
    getRequestLocale(),
    getDocsViewerContext(),
    getDocsRuntimeConfiguration(),
  ]);
  const messages = getMessages(locale);
  const navigationGroups = getVisibleDocsGroups(runtimeConfig.aiEnabled).map(
    (group) => ({
      entries: group.entries.map((entry) => ({
        href: entry.href,
        label: messages[entry.titleKey],
        searchText: messages[entry.searchTermsKey],
      })),
      id: group.id,
      label: messages[group.labelKey],
    }),
  );
  const destinations = resolvePublicInformationDestinations(runtimeConfig);

  return (
    <DocsShell
      labels={{
        backHome: messages["docs.backHome"],
        documentGuide: messages["docs.documentGuide"],
        navigation: messages["docs.navigation"],
        noResults: messages["docs.search.noResults"],
        productArea: messages["docs.productArea"],
        search: messages["docs.search"],
        signIn: messages["common.signIn"],
        siteTitle: messages["docs.siteTitle"],
        superAdmin: messages["management.superAdmin"],
        support: messages["docs.navigation.support"],
        switchLocale: messages["docs.switchLocale"],
      }}
      navigationGroups={navigationGroups}
      supportDestination={destinations.support}
      viewer={viewer}
    >
      {children}
    </DocsShell>
  );
}
