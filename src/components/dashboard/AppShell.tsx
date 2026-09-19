"use client";

import {
  AuditOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  LockOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NotificationOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { createStyles } from "antd-style";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { ManagementModeControl } from "@/components/dashboard/ManagementModeControl";
import {
  buildAppNavigation,
  type AppNavigationIcon,
} from "@/components/dashboard/app-navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const useStyles = createStyles(({ token, css }) => ({
  shell: css`
    display: grid;
    height: 100vh;
    height: 100dvh;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      grid-template-rows: auto minmax(0, 1fr);
    }
  `,
  topbar: css`
    display: grid;
    grid-template-columns: auto minmax(160px, 900px) minmax(0, 1fr) auto;
    align-items: center;
    min-height: 56px;
    gap: 20px;
    padding: 0 16px;
    background: ${token.colorBgLayout};

    @media (max-width: 720px) {
      grid-template-columns: auto minmax(0, 1fr);
      min-height: 52px;
      gap: 8px 12px;
      padding: 0 12px 8px;
    }
  `,
  announcementSlot: css`
    grid-column: 2;
    min-width: 0;

    @media (max-width: 720px) {
      grid-column: 1 / -1;
      grid-row: 2;
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
    grid-column: 4;

    .ant-btn {
      height: 32px;
    }

    @media (max-width: 720px) {
      flex: 1;
      grid-column: 2;
      grid-row: 1;
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
    gap: 14px;

    @media (max-width: 720px) {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
  navigationSection: css`
    display: grid;
    gap: 4px;

    @media (max-width: 720px) {
      display: contents;
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
  navigationEntry: css`
    display: grid;
    min-width: 0;
    gap: 3px;

    @media (max-width: 720px) {
      display: contents;
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

    &[aria-current="page"],
    &[data-active="true"] {
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
  subnavigation: css`
    display: grid;
    gap: 2px;
    margin-left: 21px;
    padding: 2px 0 4px 17px;
    border-left: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 720px) {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 0;
      padding: 0;
      border-left: 0;
    }
  `,
  subnavigationItem: css`
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;

    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }

    &[aria-current="page"] {
      color: ${token.colorPrimaryText};
      background: ${token.colorPrimaryBg};
    }

    @media (max-width: 720px) {
      flex: 0 0 auto;
      padding-inline: 8px;
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

const navigationIcons: Record<AppNavigationIcon, ReactNode> = {
  ai: <RobotOutlined />,
  announcements: <NotificationOutlined />,
  approvals: <CheckSquareOutlined />,
  audit: <AuditOutlined />,
  configuration: <SettingOutlined />,
  dashboard: <DashboardOutlined />,
  exports: <CloudServerOutlined />,
  fonts: <FontSizeOutlined />,
  resumes: <FileTextOutlined />,
  roles: <SafetyCertificateOutlined />,
  security: <LockOutlined />,
  system: <CloudServerOutlined />,
  users: <TeamOutlined />,
};

function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/app" || href === "/app/manage") return pathname === href;
  return pathname.startsWith(`${href}/`) || pathname === href;
}

export interface AppShellProps {
  access: AppShellAccess;
  announcements?: readonly LocalizedAnnouncement[];
  children: ReactNode;
  user: {
    name?: string | null;
    email: string;
  };
}

export function AppShell({
  access,
  announcements = [],
  children,
  user,
}: AppShellProps) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const contentScroll = pathname.startsWith("/app/fonts")
    ? "internal"
    : "frame";
  const userName = user.name || t("common.userFallback");
  const navigationSections = buildAppNavigation(access, t);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <AnonResumeLogo
            className={styles.brandLogo}
            loading="eager"
            variant="lockup"
          />
        </div>
        {announcements.length > 0 ? (
          <div className={styles.announcementSlot}>
            <AnnouncementBanner
              announcements={announcements}
              variant="header"
            />
          </div>
        ) : null}
        <div className={styles.account}>
          <span className={styles.userSummary}>
            {access.mode !== "product" && access.kind === "super_admin"
              ? t("management.superAdmin")
              : t("dashboard.signedInAs", {
                  name: userName,
                  email: user.email,
                })}
          </span>
          <LocaleSwitcher />
          {access.mode === "product" && access.canEnterManagement ? (
            <ManagementModeControl
              email={user.email}
              enrollmentRequired={access.mfaEnrollmentRequired}
              state="available"
            />
          ) : null}
          {access.mode === "management" && access.productAccess ? (
            <ManagementModeControl state="active" />
          ) : null}
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
            <span />
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
            {navigationSections.map((section) => (
              <section className={styles.navigationSection} key={section.id}>
                {!isSidebarCollapsed ? (
                  <span className={styles.navigationLabel}>{section.label}</span>
                ) : null}
                {section.items.map((item) => {
                  const active = isNavigationItemActive(pathname, item.href);

                  return (
                    <div className={styles.navigationEntry} key={item.id}>
                      <Tooltip
                        placement="right"
                        title={isSidebarCollapsed ? item.label : undefined}
                      >
                        <Link
                          aria-current={pathname === item.href ? "page" : undefined}
                          aria-expanded={item.children ? active : undefined}
                          aria-label={item.label}
                          className={styles.navigationItem}
                          data-active={active}
                          data-collapsed={isSidebarCollapsed}
                          href={item.href}
                        >
                          <span
                            aria-hidden="true"
                            className={styles.navigationIcon}
                            data-testid={`workbench-nav-icon-${item.id}`}
                          >
                            {navigationIcons[item.icon]}
                          </span>
                          <span
                            className={styles.navigationItemText}
                            data-collapsed={isSidebarCollapsed}
                          >
                            {item.label}
                          </span>
                        </Link>
                      </Tooltip>
                      {active && !isSidebarCollapsed && item.children?.length ? (
                        <div className={styles.subnavigation}>
                          {item.children.map((child) => (
                            <Link
                              aria-current={pathname === child.href ? "page" : undefined}
                              className={styles.subnavigationItem}
                              href={child.href}
                              key={child.id}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))}
          </nav>
        </aside>

        <div
          className={styles.frame}
          data-scroll-mode={contentScroll}
          data-testid="workbench-content-frame"
        >
          {children}
        </div>
      </div>
    </main>
  );
}
