"use client";

import { Button, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { AdminTableActions } from "@/components/admin/AdminPage";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

type ExportAction = "cancel" | "retry";

export function AdminExportActions({
  jobId,
  filename,
  status,
  canCancel,
  canRetry,
}: {
  jobId: string;
  filename: string;
  status: string;
  canCancel: boolean;
  canRetry: boolean;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [pending, setPending] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferredAction, setDeferredAction] = useState<ExportAction>();
  const [cancelOpen, setCancelOpen] = useState(false);

  async function run(action: ExportAction) {
    setPending(true);
    const response = await fetch(
      `/api/manage/exports/${encodeURIComponent(jobId)}/${action}`,
      { method: "POST" },
    );
    setPending(false);
    if (response.status === 428) {
      setDeferredAction(action);
      setReauthOpen(true);
      return;
    }
    if (!response.ok) {
      toast.error(
        response.status === 429
          ? t("exports.queueFull")
          : t("exports.stateChanged"),
      );
      return;
    }
    toast.success(
      action === "cancel" ? t("exports.cancelled") : t("exports.retried"),
    );
    router.refresh();
  }

  async function reauthenticate() {
    setPending(true);
    const response = await fetch("/api/manage/session/reauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: reauthCode }),
    });
    setPending(false);
    if (!response.ok) {
      toast.error(t("common.invalidCode"));
      return;
    }
    const action = deferredAction;
    setReauthOpen(false);
    setReauthCode("");
    setDeferredAction(undefined);
    if (action) await run(action);
  }

  return (
    <>
      <AdminTableActions>
        {canCancel && (status === "queued" || status === "running") ? (
          <Button danger loading={pending} onClick={() => setCancelOpen(true)} type="link">
            {t("exports.cancel")}
          </Button>
        ) : null}
        {canRetry && (status === "failed" || status === "cancelled") ? (
          <Button loading={pending} onClick={() => run("retry")} type="link">
            {t("exports.retry")}
          </Button>
        ) : null}
      </AdminTableActions>
      <ActionConfirmationModal
        cancelText={t("common.cancel")}
        confirmText={t("exports.cancelConfirm")}
        description={t("exports.cancelDescription", { file: filename })}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          setCancelOpen(false);
          void run("cancel");
        }}
        open={cancelOpen}
        pending={pending}
        title={t("exports.cancelTitle")}
      />
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verifyContinue")}
        onCancel={() => setReauthOpen(false)}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">
            {t("common.reauthDescription")}
          </p>
          <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
        </div>
      </Modal>
    </>
  );
}
