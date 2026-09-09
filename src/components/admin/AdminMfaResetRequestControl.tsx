"use client";

import { Button, Input, Modal, Spin } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";

import { AdminStatus } from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

interface ResetRequest {
  expiresAt: string;
  id: string;
  reason: string;
  reviewReason?: string | null;
  status: "approved" | "cancelled" | "expired" | "pending" | "rejected";
}

const useStyles = createStyles(({ css }) => ({
  content: css`
    display: grid;
    gap: 16px;
  `,
  loading: css`
    display: grid;
    min-height: 180px;
    place-items: center;
  `,
  requestSummary: css`
    display: grid;
    gap: 8px;

    p {
      margin: 0;
      white-space: pre-wrap;
    }
  `,
}));

export function AdminMfaResetRequestControl({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [request, setRequest] = useState<ResetRequest | null>(null);

  const loadRequest = useEffectEvent(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/account/management-mfa-reset", {
        signal,
      });
      const body = (await response.json()) as {
        error?: string;
        request?: ResetRequest | null;
      };
      if (!response.ok) throw new Error(body.error);
      setRequest(body.request ?? null);
    } catch {
      if (signal.aborted) return;
      toast.error(t("mfaReset.loadFailed"));
      onClose();
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadRequest(controller.signal);
    });
    return () => controller.abort();
  }, [open]);

  async function submitRequest() {
    setPending(true);
    try {
      const response = await fetch("/api/account/management-mfa-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await response.json()) as {
        error?: string;
        request?: ResetRequest;
      };
      if (!response.ok || !body.request) throw new Error(body.error);
      setRequest(body.request);
      setReason("");
      toast.success(t("mfaReset.submitted"));
    } catch {
      toast.error(t("mfaReset.submitFailed"));
    } finally {
      setPending(false);
    }
  }

  async function cancelRequest() {
    if (!request) return;
    setPending(true);
    try {
      const response = await fetch("/api/account/management-mfa-reset", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      if (!response.ok) throw new Error();
      setRequest(null);
      toast.success(t("mfaReset.cancelled"));
    } catch {
      toast.error(t("mfaReset.cancelFailed"));
    } finally {
      setPending(false);
    }
  }

  const canSubmit = reason.trim().length >= 10;
  const isPending = request?.status === "pending";
  const isApproved = request?.status === "approved";

  return (
    <Modal
      afterClose={() => {
        setLoading(true);
        setReason("");
      }}
      cancelText={t("common.cancel")}
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("mfaReset.title")}
      width={560}
    >
      {loading ? (
        <div className={styles.loading}><Spin /></div>
      ) : isPending ? (
        <div className={styles.content}>
          <div className={styles.requestSummary}>
            <AdminStatus tone="warning">{t("mfaReset.pending")}</AdminStatus>
            <p>{request.reason}</p>
            <span>{t("mfaReset.expiresAt", {
              time: new Date(request.expiresAt).toLocaleString(locale),
            })}</span>
          </div>
          <Button danger loading={pending} onClick={cancelRequest}>
            {t("mfaReset.cancel")}
          </Button>
        </div>
      ) : isApproved ? (
        <div className={styles.content}>
          <AdminStatus tone="success">{t("mfaReset.approved")}</AdminStatus>
          <p>{t("mfaReset.approvedDescription")}</p>
          <Button
            onClick={() => {
              onClose();
              router.refresh();
            }}
            type="primary"
          >
            {t("mfaReset.bindAgain")}
          </Button>
        </div>
      ) : (
        <div className={styles.content}>
          <p>{t("mfaReset.description")}</p>
          {request?.status === "rejected" ? (
            <AdminStatus tone="danger">
              {t("mfaReset.rejected")}{request.reviewReason ? `：${request.reviewReason}` : ""}
            </AdminStatus>
          ) : null}
          <Input.TextArea
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("mfaReset.reasonPlaceholder")}
            rows={5}
            value={reason}
          />
          <Button
            disabled={!canSubmit}
            loading={pending}
            onClick={submitRequest}
            type="primary"
          >
            {t("mfaReset.submit")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
