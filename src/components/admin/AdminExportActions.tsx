"use client";

import { Button, Modal, Space, message } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

type ExportAction = "cancel" | "retry";

export function AdminExportActions({
  jobId,
  status,
  canCancel,
  canRetry,
}: {
  jobId: string;
  status: string;
  canCancel: boolean;
  canRetry: boolean;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [pending, setPending] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferredAction, setDeferredAction] = useState<ExportAction>();

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
      messageApi.error(
        response.status === 429
          ? t("exports.queueFull")
          : t("exports.stateChanged"),
      );
      return;
    }
    messageApi.success(
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
      messageApi.error(t("common.invalidCode"));
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
      {contextHolder}
      <Space size={4}>
        {canCancel && (status === "queued" || status === "running") ? (
          <Button danger loading={pending} onClick={() => run("cancel")} size="small" type="link">
            {t("exports.cancel")}
          </Button>
        ) : null}
        {canRetry && (status === "failed" || status === "cancelled") ? (
          <Button loading={pending} onClick={() => run("retry")} size="small" type="link">
            {t("exports.retry")}
          </Button>
        ) : null}
      </Space>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verifyContinue")}
        onCancel={() => setReauthOpen(false)}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
      </Modal>
    </>
  );
}
