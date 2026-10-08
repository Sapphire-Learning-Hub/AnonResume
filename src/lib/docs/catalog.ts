import type { MessageKey } from "@/i18n/messages";

export type DocsArticleId =
  | "home"
  | "editor"
  | "section-templates"
  | "ai-assistant"
  | "import-export"
  | "public-appearance"
  | "account-security"
  | "troubleshooting"
  | "support";

export interface DocsCatalogEntry {
  href: `/docs${string}`;
  id: DocsArticleId;
  requiresAi?: boolean;
  searchTermsKey: MessageKey;
  titleKey: MessageKey;
}

export interface DocsCatalogGroup {
  entries: readonly DocsCatalogEntry[];
  id: "start" | "editing" | "publishing" | "account" | "support";
  labelKey: MessageKey;
}

const entries = {
  home: {
    href: "/docs",
    id: "home",
    searchTermsKey: "docs.searchTerms.home",
    titleKey: "docs.navigation.home",
  },
  editor: {
    href: "/docs/editor",
    id: "editor",
    searchTermsKey: "docs.searchTerms.editor",
    titleKey: "docs.navigation.editor",
  },
  "section-templates": {
    href: "/docs/section-templates",
    id: "section-templates",
    searchTermsKey: "docs.searchTerms.sectionTemplates",
    titleKey: "docs.navigation.sectionTemplates",
  },
  "ai-assistant": {
    href: "/docs/ai-assistant",
    id: "ai-assistant",
    requiresAi: true,
    searchTermsKey: "docs.searchTerms.aiAssistant",
    titleKey: "docs.navigation.aiAssistant",
  },
  "import-export": {
    href: "/docs/import-export",
    id: "import-export",
    searchTermsKey: "docs.searchTerms.importExport",
    titleKey: "docs.navigation.importExport",
  },
  "public-appearance": {
    href: "/docs/public-resume-customization",
    id: "public-appearance",
    searchTermsKey: "docs.searchTerms.publicAppearance",
    titleKey: "docs.navigation.publicAppearance",
  },
  "account-security": {
    href: "/docs/account-security",
    id: "account-security",
    searchTermsKey: "docs.searchTerms.accountSecurity",
    titleKey: "docs.navigation.accountSecurity",
  },
  troubleshooting: {
    href: "/docs/troubleshooting",
    id: "troubleshooting",
    searchTermsKey: "docs.searchTerms.troubleshooting",
    titleKey: "docs.navigation.troubleshooting",
  },
  support: {
    href: "/docs/support",
    id: "support",
    searchTermsKey: "docs.searchTerms.support",
    titleKey: "docs.navigation.support",
  },
} as const satisfies Record<DocsArticleId, DocsCatalogEntry>;

const groups: readonly DocsCatalogGroup[] = [
  {
    entries: [entries.home],
    id: "start",
    labelKey: "docs.navigation.group.start",
  },
  {
    entries: [entries.editor, entries["section-templates"], entries["ai-assistant"]],
    id: "editing",
    labelKey: "docs.navigation.group.editing",
  },
  {
    entries: [entries["import-export"], entries["public-appearance"]],
    id: "publishing",
    labelKey: "docs.navigation.group.publishing",
  },
  {
    entries: [entries["account-security"]],
    id: "account",
    labelKey: "docs.navigation.group.account",
  },
  {
    entries: [entries.troubleshooting, entries.support],
    id: "support",
    labelKey: "docs.navigation.group.support",
  },
];

export function getVisibleDocsGroups(aiEnabled: boolean): DocsCatalogGroup[] {
  return groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => !entry.requiresAi || aiEnabled),
  }));
}

export function getVisibleDocsEntries(aiEnabled: boolean) {
  return getVisibleDocsGroups(aiEnabled).flatMap((group) => group.entries);
}

export function getAdjacentDocsEntries(pathname: string, aiEnabled: boolean) {
  const visibleEntries = getVisibleDocsEntries(aiEnabled);
  const index = visibleEntries.findIndex((entry) => entry.href === pathname);

  return {
    next: index >= 0 ? visibleEntries[index + 1] : undefined,
    previous: index > 0 ? visibleEntries[index - 1] : undefined,
  };
}
