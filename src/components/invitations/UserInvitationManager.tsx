"use client";

import { Button, Empty, Input, Popconfirm, Tag } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import type { UserInvitationStatus } from "@/lib/invitations/types";

export type SerializedInvitation = {
  id: string;
  email: string;
  status: UserInvitationStatus;
  createdAt: string;
  lastSentAt: string;
  expiresAt: string;
  nextResendAt: string;
};

export type InvitationPageData = {
  activeCount: number;
  limit: number;
  now: string;
  items: SerializedInvitation[];
};

const useStyles = createStyles(({ token, css }) => ({
  page: css`
    display: grid;
    min-width: 0;
  `,
  catalog: css`
    display: grid;
    min-width: 0;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 58px;
    gap: 20px;
    padding: 5px 0 21px;

    @media (max-width: 720px) {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding: 0 0 16px;
    }
  `,
  usage: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    white-space: nowrap;
  `,
  usageValue: css`
    margin-left: 6px;
    color: ${token.colorTextSecondary};
    font-weight: 600;
  `,
  inviteForm: css`
    display: flex;
    align-items: center;
    width: min(520px, 100%);
    gap: 12px;

    @media (max-width: 720px) {
      align-items: stretch;
      width: 100%;
      flex-direction: column;
    }
  `,
  inviteInput: css`
    && {
      flex: 1;
      min-width: 0;
    }
  `,
  tableViewport: css`
    overflow-x: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 4px;
  `,
  table: css`
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
    table-layout: fixed;

    th,
    td {
      padding: 0 16px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
      text-align: left;
      vertical-align: middle;
    }

    th {
      height: 43px;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      font-size: 13px;
      font-weight: 500;
    }

    td {
      height: 64px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    tbody tr {
      transition: background 120ms ease;
    }

    tbody tr:hover {
      background: ${token.colorFillQuaternary};
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }

    @media (max-width: 720px) {
      min-width: 0;

      colgroup {
        display: none;
      }

      thead {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
      }

      tbody,
      tr,
      td {
        display: block;
        width: 100%;
      }

      tbody tr {
        box-sizing: border-box;
        padding: 14px 16px;
        border-bottom: 1px solid ${token.colorBorderSecondary};
      }

      tbody tr:last-child {
        border-bottom: 0;
      }

      td {
        display: grid;
        box-sizing: border-box;
        grid-template-columns: 78px minmax(0, 1fr);
        gap: 12px;
        height: auto;
        padding: 7px 0;
        border: 0;
      }

      td::before {
        content: attr(data-label);
        color: ${token.colorTextTertiary};
        font-size: 12px;
      }
    }
  `,
  empty: css`
    display: grid;
    min-height: 280px;
    place-items: center;
  `,
  email: css`
    overflow-wrap: anywhere;
    color: ${token.colorText};
    font-weight: 600;
  `,
  meta: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.5;
  `,
  status: css`
    display: grid;
    justify-items: start;
    gap: 4px;

    .ant-tag {
      margin: 0;
    }
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    gap: 4px;

    @media (max-width: 720px) {
      justify-content: flex-start;
    }
  `,
}));

export function UserInvitationManager({
  initialData,
  onChange,
}: {
  initialData: InvitationPageData;
  onChange: () => void;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const [email, setEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<string>();
  const now = new Date(initialData.now).getTime();

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  async function request(
    key: string,
    url: string,
    options: RequestInit,
  ) {
    setPendingAction(key);
    try {
      const response = await fetch(url, options);
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        nextAllowedAt?: string;
      };
      if (!response.ok) {
        const message = payload.error === "INVITATION_LIMIT_REACHED"
          ? t("invitations.error.limit")
          : payload.error === "INVITATION_RESEND_TOO_SOON" && payload.nextAllowedAt
            ? t("invitations.error.cooldown", {
                time: dateFormatter.format(new Date(payload.nextAllowedAt)),
              })
            : t("invitations.error.generic");
        toast.error({ key: "invitation-operation", content: message });
        return false;
      }
      toast.success(t("invitations.processed"));
      onChange();
      return true;
    } catch {
      toast.error({
        key: "invitation-operation",
        content: t("invitations.error.generic"),
      });
      return false;
    } finally {
      setPendingAction(undefined);
    }
  }

  async function submit() {
    if (!email.trim()) return;
    const completed = await request("create", "/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (completed) setEmail("");
  }

  const statusLabels: Record<UserInvitationStatus, string> = {
    pending: t("invitations.status.pending"),
    accepted: t("invitations.status.accepted"),
    expired: t("invitations.status.expired"),
    revoked: t("invitations.status.revoked"),
    registered_independently: t("invitations.status.independent"),
    accepted_via_other_invitation: t("invitations.status.otherInvitation"),
  };

  return (
    <div className={styles.page}>
      <section aria-label={t("invitations.title")} className={styles.catalog}>
        <div className={styles.toolbar}>
          <div className={styles.inviteForm}>
            <Input
              aria-label={t("invitations.email")}
              className={styles.inviteInput}
              onChange={(event) => setEmail(event.target.value)}
              onPressEnter={() => void submit()}
              placeholder={t("invitations.emailPlaceholder")}
              type="email"
              value={email}
            />
            <Button
              disabled={!email.trim()}
              loading={pendingAction === "create"}
              onClick={() => void submit()}
              type="primary"
            >
              {t("invitations.send")}
            </Button>
          </div>
          <div className={styles.usage}>
            {t("invitations.active")}
            <span className={styles.usageValue}>
              {initialData.activeCount} / {initialData.limit}
            </span>
          </div>
        </div>

        <div className={styles.tableViewport}>
          {initialData.items.length === 0 ? (
            <div className={styles.empty}>
              <Empty description={t("invitations.empty")} />
            </div>
          ) : (
            <table aria-label={t("invitations.title")} className={styles.table}>
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "22%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t("invitations.email")}</th>
                  <th scope="col">{t("invitations.table.status")}</th>
                  <th scope="col">{t("invitations.table.sentAt")}</th>
                  <th scope="col">{t("invitations.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {initialData.items.map((invitation) => {
                  const actionable = invitation.status === "pending" || invitation.status === "expired";
                  const resendAvailable = actionable && now >= new Date(invitation.nextResendAt).getTime();
                  return (
                    <tr key={invitation.id}>
                      <td data-label={t("invitations.email")}>
                        <span className={styles.email}>{invitation.email}</span>
                      </td>
                      <td data-label={t("invitations.table.status")}>
                        <div className={styles.status}>
                          <Tag>{statusLabels[invitation.status]}</Tag>
                          {actionable ? (
                            <p className={styles.meta}>
                              {resendAvailable
                                ? t("invitations.resendAvailable")
                                : t("invitations.resendAt", {
                                    time: dateFormatter.format(new Date(invitation.nextResendAt)),
                                  })}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td data-label={t("invitations.table.sentAt")}>
                        {dateFormatter.format(new Date(invitation.lastSentAt))}
                      </td>
                      <td data-label={t("invitations.table.actions")}>
                        <div className={styles.actions}>
                          {actionable ? (
                            <Button
                              disabled={!resendAvailable}
                              loading={pendingAction === `resend:${invitation.id}`}
                              onClick={() => void request(
                                `resend:${invitation.id}`,
                                `/api/invitations/${invitation.id}/resend`,
                                { method: "POST" },
                              )}
                              type="link"
                            >
                              {t("invitations.resend")}
                            </Button>
                          ) : null}
                          {invitation.status === "pending" ? (
                            <Popconfirm
                              cancelText={t("common.cancel")}
                              okText={t("invitations.revokeConfirm")}
                              onConfirm={() => request(
                                `revoke:${invitation.id}`,
                                `/api/invitations/${invitation.id}`,
                                { method: "DELETE" },
                              )}
                              title={t("invitations.revokeTitle")}
                            >
                              <Button
                                danger
                                loading={pendingAction === `revoke:${invitation.id}`}
                                type="link"
                              >
                                {t("invitations.revoke")}
                              </Button>
                            </Popconfirm>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
