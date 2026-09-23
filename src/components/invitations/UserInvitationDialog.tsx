"use client";

import { Button, Empty, Modal, Spin, theme } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  UserInvitationManager,
  type InvitationPageData,
} from "@/components/invitations/UserInvitationManager";
import { useI18n } from "@/i18n/I18nProvider";

const invitationResponseSchema = z.object({
  activeCount: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string(),
    email: z.string(),
    status: z.enum([
      "pending",
      "accepted",
      "expired",
      "revoked",
      "registered_independently",
      "accepted_via_other_invitation",
    ]),
    createdAt: z.iso.datetime({ offset: true }),
    lastSentAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    nextResendAt: z.iso.datetime({ offset: true }),
  })),
});

const useStyles = createStyles(({ css }) => ({
  body: css`
    max-height: min(70dvh, 720px);
    overflow-y: auto;
  `,
  status: css`
    display: grid;
    min-height: 260px;
    place-content: center;
    justify-items: center;
    gap: 16px;
  `,
}));

export function UserInvitationDialog({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const { styles } = useStyles();
  const { token } = theme.useToken();
  const { t } = useI18n();
  const [data, setData] = useState<InvitationPageData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  function reload() {
    setData(null);
    setLoadFailed(false);
    setReloadVersion((version) => version + 1);
  }

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/invitations", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Invitation list unavailable");
        const result = invitationResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setData({ ...result, now: new Date().toISOString() });
        }
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
    }

    void load();
    return () => controller.abort();
  }, [open, reloadVersion]);

  return (
    <Modal
      classNames={{ body: styles.body }}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("invitations.title")}
      width={880}
      zIndex={token.zIndexPopupBase + 200}
    >
      {data ? (
        <UserInvitationManager
          initialData={data}
          onChange={reload}
        />
      ) : loadFailed ? (
        <div className={styles.status}>
          <Empty description={t("invitations.error.load")} />
          <Button onClick={reload}>
            {t("invitations.retry")}
          </Button>
        </div>
      ) : (
        <div aria-label={t("invitations.loading")} className={styles.status} role="status">
          <Spin />
        </div>
      )}
    </Modal>
  );
}
