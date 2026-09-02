"use client";

import {
  FileTextOutlined,
  FontSizeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { createStyles } from "antd-style";
import { usePathname } from "next/navigation";
import { type MouseEvent, useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { ResumeDashboardShell } from "@/components/dashboard/ResumeDashboardShell";
import { FontMarket } from "@/components/fonts/FontMarket";
import { useI18n } from "@/i18n/I18nProvider";
import type { ResumeCatalogEntry } from "@/lib/resume-catalog";

export type WorkbenchNavigationItem = "resumes" | "fonts";

const useStyles = createStyles(({ token, css }) => ({
  shell: css`
    display: grid;
    height: 100vh;
    height: 100dvh;
    grid-template-rows: 56px minmax(0, 1fr);
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      grid-template-rows: 52px minmax(0, 1fr);
    }
  `,
  topbar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 56px;
    gap: 20px;
    padding: 0 16px;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      min-height: 52px;
      gap: 12px;
      padding: 0 12px;
    }
  `,
  brandGroup: css`
    display: flex;
    align-items: center;
    min-width: 0;
  `,
  brandLogo: css`
    display: block;
    width: 146px;
    height: auto;
    object-fit: contain;

    @media (max-width: 720px) {
      width: 126px;
    }
  `,
  account: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    gap: 10px;

    .ant-btn {
      height: 32px;
    }

    @media (max-width: 720px) {
      flex: 1;
    }
  `,
  userSummary: css`
    overflow: hidden;
    max-width: 440px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (max-width: 720px) {
      margin-left: auto;
      max-width: 128px;
    }

    @media (max-width: 480px) {
      display: none;
    }
  `,
  workspace: css`
    display: grid;
    grid-template-columns: 273px minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
    transition: grid-template-columns 180ms ease;

    &[data-collapsed="true"] {
      grid-template-columns: 56px minmax(0, 1fr);
    }

    @media (max-width: 720px) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);

      &[data-collapsed="true"] {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  sidebar: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 4px;
    padding: 12px 8px;
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      padding: 8px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  sidebarHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 8px;
    padding: 0 2px 4px 10px;

    &[data-collapsed="true"] {
      justify-content: center;
      padding-inline: 0;
    }

    @media (max-width: 720px) {
      display: none;
    }
  `,
  collapseButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 8px;
      color: ${token.colorTextSecondary};

      &:hover {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }
    }
  `,
  navigation: css`
    display: grid;
    gap: 4px;

    @media (max-width: 720px) {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
  navigationLabel: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    font-weight: 500;

    @media (max-width: 720px) {
      display: none;
    }
  `,
  navigationItem: css`
    display: flex;
    align-items: center;
    min-height: 36px;
    gap: 10px;
    padding: 0 12px;
    border-radius: 8px;
    color: ${token.colorText};
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;

    &:hover {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }

    &[aria-current="page"] {
      background: ${token.colorPrimaryBg};
      color: ${token.colorPrimaryText};
    }

    &[data-collapsed="true"] {
      justify-content: center;
      gap: 0;
      width: 40px;
      margin-inline: auto;
      padding-inline: 0;
    }

    @media (max-width: 720px) {
      &[data-collapsed="true"] {
        justify-content: flex-start;
        gap: 10px;
        width: auto;
        margin-inline: 0;
        padding-inline: 12px;
      }
    }
  `,
  navigationIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 18px;
    width: 18px;
    font-size: 17px;
  `,
  navigationItemText: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &[data-collapsed="true"] {
      display: none;
    }

    @media (max-width: 720px) {
      &[data-collapsed="true"] {
        display: inline;
      }
    }
  `,
  frame: css`
    display: grid;
    align-content: start;
    min-width: 0;
    min-height: 0;
    margin: 4px 8px 8px 0;
    padding: 0 32px 40px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    border-radius: 12px;
    background: ${token.colorBgContainer};

    &[data-scroll-mode="internal"] {
      align-content: stretch;
      padding-bottom: 0;
      overflow-y: hidden;
      scrollbar-gutter: auto;
    }

    @media (max-width: 720px) {
      margin: 0;
      padding: 0 16px 28px;
      border-radius: 0;

      &[data-scroll-mode="internal"] {
        padding-bottom: 0;
      }
    }
  `,
}));

export function WorkbenchShell({
  createAction,
  resumes,
  user,
}: {
  createAction: string;
  resumes: ResumeCatalogEntry[];
  user: {
    name?: string | null;
    email: string;
  };
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeItem: WorkbenchNavigationItem = pathname.startsWith("/app/fonts")
    ? "fonts"
    : "resumes";
  const contentScroll = activeItem === "fonts" ? "internal" : "frame";
  const userName = user.name || t("common.userFallback");
  const navigationItems = [
    {
      id: "resumes" as const,
      href: "/app",
      icon: <FileTextOutlined />,
      label: t("dashboard.resumeList"),
    },
    {
      id: "fonts" as const,
      href: "/app/fonts",
      icon: <FontSizeOutlined />,
      label: t("fontMarket.navigation"),
    },
  ];

  function switchWorkbenchView(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (pathname !== href) {
      window.history.pushState(null, "", href);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <AnonResumeLogo className={styles.brandLogo} priority variant="lockup" />
        </div>
        <div className={styles.account}>
          <span className={styles.userSummary}>
            {t("dashboard.signedInAs", { name: userName, email: user.email })}
          </span>
          <SignOutButton />
        </div>
      </header>

      <div
        className={styles.workspace}
        data-collapsed={isSidebarCollapsed}
        data-testid="workbench-workspace"
      >
        <aside
          className={styles.sidebar}
          data-collapsed={isSidebarCollapsed}
        >
          <div
            className={styles.sidebarHeader}
            data-collapsed={isSidebarCollapsed}
          >
            {!isSidebarCollapsed ? (
              <span className={styles.navigationLabel}>
                {t("dashboard.resumeManagement")}
              </span>
            ) : null}
            <Tooltip
              placement="right"
              title={
                isSidebarCollapsed
                  ? t("dashboard.expandSidebar")
                  : t("dashboard.collapseSidebar")
              }
            >
              <Button
                aria-expanded={!isSidebarCollapsed}
                aria-label={
                  isSidebarCollapsed
                    ? t("dashboard.expandSidebar")
                    : t("dashboard.collapseSidebar")
                }
                className={styles.collapseButton}
                icon={
                  isSidebarCollapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                }
                type="text"
                onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              />
            </Tooltip>
          </div>
          <nav aria-label={t("dashboard.navigation")} className={styles.navigation}>
            {navigationItems.map((item) => {
              const active = item.id === activeItem;

              return (
                <Tooltip
                  key={item.id}
                  placement="right"
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <a
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={styles.navigationItem}
                    data-collapsed={isSidebarCollapsed}
                    href={item.href}
                    onClick={(event) => switchWorkbenchView(event, item.href)}
                  >
                    <span
                      aria-hidden="true"
                      className={styles.navigationIcon}
                      data-testid={`workbench-nav-icon-${item.id}`}
                    >
                      {item.icon}
                    </span>
                    <span
                      className={styles.navigationItemText}
                      data-collapsed={isSidebarCollapsed}
                    >
                      {item.label}
                    </span>
                  </a>
                </Tooltip>
              );
            })}
          </nav>
        </aside>

        <div
          className={styles.frame}
          data-scroll-mode={contentScroll}
          data-testid="workbench-content-frame"
        >
          {activeItem === "fonts" ? (
            <FontMarket resumes={resumes} />
          ) : (
            <ResumeDashboardShell
              createAction={createAction}
              resumes={resumes}
            />
          )}
        </div>
      </div>
    </main>
  );
}
