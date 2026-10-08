"use client";

import {
  ExportOutlined,
  GlobalOutlined,
  MenuOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Input } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useState, type ReactNode } from "react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { useI18n } from "@/i18n/I18nProvider";
import type { DocsViewerContext } from "@/lib/auth/docs-context";
import type { PublicDestination } from "@/lib/public-info/destinations";

import { useDocsShellStyles } from "./DocsShell.style";

export interface DocsShellLabels {
  backHome: string;
  documentGuide: string;
  navigation: string;
  noResults: string;
  productArea: string;
  search: string;
  signIn: string;
  siteTitle: string;
  superAdmin: string;
  support: string;
  switchLocale: string;
}

export interface DocsNavigationGroup {
  entries: readonly {
    href: string;
    label: string;
    searchText: string;
  }[];
  id: string;
  label: string;
}

export function DocsShell({
  children,
  labels,
  navigationGroups,
  supportDestination,
  viewer,
}: {
  children: ReactNode;
  labels: DocsShellLabels;
  navigationGroups: readonly DocsNavigationGroup[];
  supportDestination: PublicDestination;
  viewer: DocsViewerContext | null;
}) {
  const { styles } = useDocsShellStyles();
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
  const filteredGroups = navigationGroups.flatMap((group) => {
    const filteredEntries = group.entries.filter((entry) =>
      `${entry.label} ${entry.searchText}`
        .toLowerCase()
        .includes(deferredSearchValue),
    );
    return filteredEntries.length > 0
      ? [{ ...group, entries: filteredEntries }]
      : [];
  });
  const navigation = (
    <div>
      <Input
        allowClear
        aria-label={labels.search}
        className={styles.navigationSearch}
        onChange={(event) => setSearchValue(event.target.value)}
        placeholder={labels.search}
        prefix={<SearchOutlined aria-hidden="true" />}
        type="search"
        value={searchValue}
      />
      <nav
        aria-label={labels.navigation}
        className={styles.navigation}
        hidden={filteredGroups.length === 0}
      >
        {filteredGroups.map((group) => (
          <section className={styles.navigationSection} key={group.id}>
            <p className={styles.navigationGroup}>{group.label}</p>
            <div className={styles.navigationLinks}>
              {group.entries.map((entry) => (
                <Link
                  aria-current={pathname === entry.href ? "page" : undefined}
                  data-active={pathname === entry.href}
                  href={entry.href}
                  key={entry.href}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </nav>
      <p className={styles.noResults} hidden={filteredGroups.length > 0}>
        {labels.noResults}
      </p>
    </div>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandCluster}>
            <Link aria-label="AnonResume" className={styles.brand} href="/">
              <AnonResumeLogo loading="eager" variant="lockup" />
            </Link>
            <span aria-hidden="true" className={styles.brandDivider} />
            <span className={styles.siteTitle}>{labels.siteTitle}</span>
          </div>
          <div className={styles.headerActions}>
            <Button
              aria-label={labels.switchLocale}
              icon={<GlobalOutlined />}
              onClick={() =>
                setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")
              }
              type="text"
            >
              {locale === "zh-CN" ? "简体" : "English"}
            </Button>
            {supportDestination.external ? (
              <a
                className={styles.backLink}
                href={supportDestination.href}
                rel="noreferrer"
                target="_blank"
              >
                {labels.support}
                <ExportOutlined aria-hidden="true" />
              </a>
            ) : (
              <Link className={styles.backLink} href={supportDestination.href}>
                {labels.support}
              </Link>
            )}
            <Link className={styles.backLink} href="/">
              {labels.backHome}
            </Link>
            {viewer ? (
              <Link
                aria-label={`${viewer.name} ${viewer.email}${
                  viewer.managementOnly ? ` ${labels.superAdmin}` : ""
                }`}
                className={styles.accountLink}
                href={viewer.destinationHref}
                title={viewer.email}
              >
                <span aria-hidden="true" className={styles.accountIcon}>
                  <UserOutlined />
                </span>
                <span className={styles.accountIdentity}>
                  <span>{viewer.name}</span>
                  {viewer.managementOnly ? (
                    <small>{labels.superAdmin}</small>
                  ) : null}
                </span>
              </Link>
            ) : (
              <Link className={styles.accountLink} href="/sign-in">
                <span aria-hidden="true" className={styles.accountIcon}>
                  <UserOutlined />
                </span>
                <span className={styles.accountIdentity}>{labels.signIn}</span>
              </Link>
            )}
          </div>
        </div>
        <div className={styles.subHeader}>
          <MenuOutlined aria-hidden="true" />
          <strong>{labels.productArea}</strong>
          <span aria-hidden="true" className={styles.subHeaderDivider} />
          <span>{labels.documentGuide}</span>
        </div>
      </header>

      <details className={styles.mobileNavigation}>
        <summary>
          <MenuOutlined aria-hidden="true" />
          {labels.navigation}
        </summary>
        {navigation}
      </details>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>{navigation}</aside>
        <main className={styles.content} id="docs-content">
          {children}
        </main>
      </div>
    </div>
  );
}
