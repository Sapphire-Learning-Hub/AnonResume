"use client";

import { RightOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { ManagementModeControl } from "@/components/dashboard/ManagementModeControl";
import { UserInvitationDialog } from "@/components/invitations/UserInvitationDialog";
import { useI18n } from "@/i18n/I18nProvider";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";

const useStyles = createStyles(({ token, css }) => ({
  footer: css`
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 720px) {
      flex: 0 0 auto;
      margin-top: 0;
      padding: 0 0 0 8px;
      border-top: 0;
      border-left: 1px solid ${token.colorBorderSecondary};
    }
  `,
  trigger: css`
    display: grid;
    box-sizing: border-box;
    width: 100%;
    min-height: 56px;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: ${token.colorText};
    cursor: pointer;
    text-align: left;
    transition: background 140ms ease;

    &:hover,
    &[aria-expanded="true"] {
      background: ${token.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }

    &[data-collapsed="true"] {
      width: 40px;
      min-height: 40px;
      grid-template-columns: 1fr;
      justify-items: center;
      margin-inline: auto;
      padding: 0;
    }

    @media (max-width: 720px) {
      width: 40px;
      min-height: 40px;
      grid-template-columns: 1fr;
      justify-items: center;
      padding: 0;
    }
  `,
  avatar: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimaryText};
    font-size: 18px;
  `,
  identity: css`
    display: grid;
    min-width: 0;
    gap: 2px;

    &[data-collapsed="true"] {
      display: none;
    }

    @media (max-width: 720px) {
      display: none;
    }
  `,
  name: css`
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  email: css`
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  role: css`
    color: ${token.colorPrimaryText};
    font-size: 11px;
    font-weight: 600;
  `,
  chevron: css`
    color: ${token.colorTextTertiary};
    font-size: 11px;

    &[data-collapsed="true"] {
      display: none;
    }

    @media (max-width: 720px) {
      display: none;
    }
  `,
  menu: css`
    display: grid;
    width: 260px;
    gap: 10px;
  `,
  menuIdentity: css`
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    padding: 4px 4px 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  actions: css`
    display: grid;
    gap: 4px;
  `,
  actionButton: css`
    && {
      justify-content: flex-start;
      width: 100%;
      min-height: 38px;
      padding-inline: 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: ${token.colorText};
      box-shadow: none;
      text-align: left;

      &:hover {
        background: ${token.colorFillTertiary};
        color: ${token.colorText};
        box-shadow: none;
      }

      &:active {
        background: ${token.colorFillSecondary};
        color: ${token.colorText};
        box-shadow: none;
      }
    }
  `,
}));

export function WorkbenchAccountMenu({
  access,
  collapsed,
  email,
  name,
}: {
  access: AppShellAccess;
  collapsed: boolean;
  email: string;
  name: string;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [invitationSession, setInvitationSession] = useState(0);
  const accessibleName = `${name} ${email}`;
  const role = access.mode !== "product" && access.kind === "super_admin"
    ? t("management.superAdmin")
    : undefined;
  const trigger = (
    <button
      aria-expanded={menuOpen}
      aria-label={accessibleName}
      className={styles.trigger}
      data-collapsed={collapsed}
      type="button"
    >
      <span aria-hidden="true" className={styles.avatar}>
        <UserOutlined />
      </span>
      <span className={styles.identity} data-collapsed={collapsed}>
        <span className={styles.name}>{name}</span>
        <span className={styles.email}>{email}</span>
      </span>
      <RightOutlined
        aria-hidden="true"
        className={styles.chevron}
        data-collapsed={collapsed}
      />
    </button>
  );

  return (
    <div className={styles.footer} data-testid="workbench-account-footer">
      <Popover
        arrow={false}
        content={
          <div className={styles.menu}>
            <div className={styles.menuIdentity}>
              <span aria-hidden="true" className={styles.avatar}>
                <UserOutlined />
              </span>
              <span className={styles.identity}>
                <span className={styles.name}>{name}</span>
                <span className={styles.email}>{email}</span>
                {role ? <span className={styles.role}>{role}</span> : null}
              </span>
            </div>
            <div className={styles.actions}>
              {access.productAccess ? (
                <Button
                  className={styles.actionButton}
                  icon={<UserAddOutlined aria-hidden="true" />}
                  onClick={() => {
                    setMenuOpen(false);
                    setInvitationSession((session) => session + 1);
                    setInvitationOpen(true);
                  }}
                  type="text"
                >
                  {t("invitations.navigation")}
                </Button>
              ) : null}
              <LocaleSwitcher
                className={styles.actionButton}
                onActivate={() => setMenuOpen(false)}
                presentation="menu"
              />
              {access.mode === "product" && access.canEnterManagement ? (
                <ManagementModeControl
                  buttonClassName={styles.actionButton}
                  email={email}
                  enrollmentRequired={access.mfaEnrollmentRequired}
                  onActivate={() => setMenuOpen(false)}
                  state="available"
                />
              ) : null}
              {access.mode === "management" && access.productAccess ? (
                <ManagementModeControl
                  buttonClassName={styles.actionButton}
                  onActivate={() => setMenuOpen(false)}
                  state="active"
                />
              ) : null}
              <SignOutButton
                className={styles.actionButton}
                onActivate={() => setMenuOpen(false)}
              />
            </div>
          </div>
        }
        onOpenChange={setMenuOpen}
        open={menuOpen}
        placement="rightBottom"
        trigger="click"
      >
        {collapsed ? (
          <Tooltip placement="right" title={accessibleName}>
            {trigger}
          </Tooltip>
        ) : trigger}
      </Popover>
      <UserInvitationDialog
        key={invitationSession}
        onClose={() => setInvitationOpen(false)}
        open={invitationOpen}
      />
    </div>
  );
}
