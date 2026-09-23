"use client";

import { Button, Card, Empty, Input, Popconfirm, Tag } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
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
  items: SerializedInvitation[];
};

const useStyles = createStyles(({ token, css }) => ({
  page: css`
    display: grid;
    gap: 24px;
    width: min(1080px, 100%);
    margin: 0 auto;
    padding: 32px;
  `,
  header: css`
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
  `,
  heading: css`
    margin: 0 0 6px;
    color: ${token.colorText};
    font-size: 30px;
  `,
  description: css`
    margin: 0;
    color: ${token.colorTextSecondary};
  `,
  usage: css`
    color: ${token.colorTextSecondary};
    font-size: 14px;
  `,
  usageValue: css`
    margin-left: 8px;
    color: ${token.colorText};
    font-size: 22px;
    font-weight: 700;
  `,
  inviteForm: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  `,
  list: css`
    display: grid;
    gap: 12px;
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) minmax(150px, 0.8fr) auto;
    align-items: center;
    gap: 20px;
    padding: 18px 20px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};

    @media (max-width: 760px) {
      grid-template-columns: 1fr;
      gap: 10px;
    }
  `,
  email: css`
    margin: 0 0 4px;
    overflow-wrap: anywhere;
    font-weight: 650;
  `,
  meta: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    gap: 4px;

    @media (max-width: 760px) {
      justify-content: flex-start;
    }
  `,
}));

export function UserInvitationManager({ initialData }: { initialData: InvitationPageData }) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<string>();

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
      router.refresh();
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
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>{t("invitations.title")}</h1>
          <p className={styles.description}>{t("invitations.description")}</p>
        </div>
        <div className={styles.usage}>
          {t("invitations.active")}
          <span className={styles.usageValue}>
            {initialData.activeCount} / {initialData.limit}
          </span>
        </div>
      </header>

      <Card>
        <div className={styles.inviteForm}>
          <Input
            aria-label={t("invitations.email")}
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
      </Card>

      {initialData.items.length === 0 ? (
        <Card><Empty description={t("invitations.empty")} /></Card>
      ) : (
        <div className={styles.list}>
          {initialData.items.map((invitation) => {
            const actionable = invitation.status === "pending" || invitation.status === "expired";
            const resendAvailable = actionable && Date.now() >= new Date(invitation.nextResendAt).getTime();
            return (
              <article className={styles.row} key={invitation.id}>
                <div>
                  <p className={styles.email}>{invitation.email}</p>
                  <p className={styles.meta}>
                    {t("invitations.sentAt", {
                      time: dateFormatter.format(new Date(invitation.lastSentAt)),
                    })}
                  </p>
                </div>
                <div>
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
                      <Button danger loading={pendingAction === `revoke:${invitation.id}`} type="link">
                        {t("invitations.revoke")}
                      </Button>
                    </Popconfirm>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
