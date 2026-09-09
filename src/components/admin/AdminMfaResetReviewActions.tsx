"use client";

import { Button, Input, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import {
  AdminIdentity,
  AdminStatus,
  AdminTableActions,
} from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

type Decision = "approved" | "rejected";
type RequestStatus = "approved" | "cancelled" | "expired" | "pending" | "rejected";

function statusTone(status: RequestStatus) {
  if (status === "approved") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "default" as const;
}

export function AdminMfaResetReviewActions({
  expiresAt,
  reason,
  requestId,
  requestedAt,
  requesterEmail,
  requesterName,
  reviewReason,
  status,
  statusLabel,
}: {
  expiresAt: string;
  reason: string;
  requestId: string;
  requestedAt: string;
  requesterEmail: string;
  requesterName: string;
  reviewReason?: string | null;
  status: RequestStatus;
  statusLabel: string;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [decision, setDecision] = useState<Decision>();
  const [reviewNote, setReviewNote] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [pending, setPending] = useState(false);

  async function review() {
    if (!decision) return;
    setPending(true);
    try {
      const response = await fetch(
        `/api/manage/mfa-reset-requests/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: reviewNote.trim() || undefined,
          }),
        },
      );
      if (response.status === 428) {
        setReauthOpen(true);
        return;
      }
      if (!response.ok) throw new Error();
      setDecision(undefined);
      setDetailsOpen(false);
      setReviewNote("");
      toast.success(t(decision === "approved" ? "mfaReset.approveSuccess" : "mfaReset.rejectSuccess"));
      router.refresh();
    } catch {
      toast.error(t("mfaReset.reviewFailed"));
    } finally {
      setPending(false);
    }
  }

  async function reauthenticate() {
    setPending(true);
    try {
      const response = await fetch("/api/manage/session/reauth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: reauthCode }),
      });
      if (!response.ok) throw new Error();
      setReauthOpen(false);
      setReauthCode("");
      await review();
    } catch {
      toast.error(t("common.invalidCode"));
      setPending(false);
    }
  }

  return (
    <>
      <AdminTableActions>
        <Button onClick={() => setDetailsOpen(true)} type="link">
          {t("common.details")}
        </Button>
      </AdminTableActions>
      <Modal
        footer={status === "pending" ? [
          <Button
            danger
            key="reject"
            onClick={() => setDecision("rejected")}
          >
            {t("mfaReset.reject")}
          </Button>,
          <Button
            key="approve"
            onClick={() => setDecision("approved")}
            type="primary"
          >
            {t("mfaReset.approve")}
          </Button>,
        ] : null}
        onCancel={() => setDetailsOpen(false)}
        open={detailsOpen}
        title={t("mfaReset.detailTitle")}
        width={560}
      >
        <dl className="admin-detail-list">
          <div>
            <dt>{t("mfaReset.requester")}</dt>
            <dd>
              <AdminIdentity
                description={requesterEmail}
                title={requesterName}
              />
            </dd>
          </div>
          <div>
            <dt>{t("mfaReset.reason")}</dt>
            <dd className="admin-detail-list__long-text">{reason}</dd>
          </div>
          <div>
            <dt>{t("mfaReset.status")}</dt>
            <dd>
              <AdminStatus tone={statusTone(status)}>{statusLabel}</AdminStatus>
            </dd>
          </div>
          <div>
            <dt>{t("mfaReset.requestedAt")}</dt>
            <dd>{requestedAt}</dd>
          </div>
          <div>
            <dt>{t("mfaReset.expires")}</dt>
            <dd>{expiresAt}</dd>
          </div>
          {reviewReason ? (
            <div>
              <dt>{t("mfaReset.reviewReason")}</dt>
              <dd className="admin-detail-list__long-text">{reviewReason}</dd>
            </div>
          ) : null}
        </dl>
      </Modal>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{
          disabled: decision === "rejected" && !reviewNote.trim(),
          loading: pending,
        }}
        okText={t(decision === "approved" ? "mfaReset.approveConfirm" : "mfaReset.rejectConfirm")}
        onCancel={() => {
          setDecision(undefined);
          setReviewNote("");
        }}
        onOk={review}
        open={Boolean(decision) && !reauthOpen}
        title={t(decision === "approved" ? "mfaReset.approveTitle" : "mfaReset.rejectTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">{t("mfaReset.reviewDescription")}</p>
          <Input.TextArea
            maxLength={1000}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder={t("mfaReset.reviewReasonPlaceholder")}
            rows={4}
            value={reviewNote}
          />
        </div>
      </Modal>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verify")}
        onCancel={() => {
          setReauthOpen(false);
          setDecision(undefined);
          setReviewNote("");
        }}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">{t("common.reauthDescription")}</p>
          <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
        </div>
      </Modal>
    </>
  );
}
