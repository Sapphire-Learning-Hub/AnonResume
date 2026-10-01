"use client";

import {
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

import { useDocsShellStyles } from "./DocsShell.style";

export interface DocsShellLabels {
  backHome: string;
  documentGuide: string;
  guideSection: string;
  home: string;
  navigation: string;
  noResults: string;
  productArea: string;
  publicAppearance: string;
  search: string;
  signIn: string;
  siteTitle: string;
  superAdmin: string;
  switchLocale: string;
}

export function DocsShell({
  children,
  labels,
  viewer,
}: {
  children: ReactNode;
  labels: DocsShellLabels;
  viewer: DocsViewerContext | null;
}) {
  const { styles } = useDocsShellStyles();
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
  const entries = [
    { href: "/docs", label: labels.home },
    {
      href: "/docs/public-resume-customization",
      label: labels.publicAppearance,
    },
  ];
  const filteredEntries = entries.filter((entry) =>
    entry.label.toLowerCase().includes(deferredSearchValue),
  );
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
      <p className={styles.navigationGroup}>{labels.guideSection}</p>
      <nav
        aria-label={labels.navigation}
        className={styles.navigation}
        hidden={filteredEntries.length === 0}
      >
        {filteredEntries.map((entry) => (
          <Link
            aria-current={pathname === entry.href ? "page" : undefined}
            data-active={pathname === entry.href}
            href={entry.href}
            key={entry.href}
          >
            {entry.label}
          </Link>
        ))}
      </nav>
      <p className={styles.noResults} hidden={filteredEntries.length > 0}>
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
