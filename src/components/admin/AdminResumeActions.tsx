"use client";

import { Button, Input, Modal, Space, message } from "antd";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

export function AdminResumeActions({
  userId,
  resumeId,
  published,
  canReadContent,
  canUnpublish,
}: {
  userId: string;
  resumeId: string;
  published: boolean;
  canReadContent: boolean;
  canUnpublish: boolean;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [pending, setPending] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function unpublish() {
    setPending(true);
    const response = await fetch(
      `/api/manage/resumes/${encodeURIComponent(userId)}/${encodeURIComponent(resumeId)}/unpublish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    setPending(false);
    if (response.status === 428) {
      setReauthOpen(true);
      return;
    }
    if (!response.ok) {
      messageApi.error(t("resumes.unpublishFailed"));
      return;
    }
    messageApi.success(t("resumes.unpublishSuccess"));
    setReasonOpen(false);
    setReason("");
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
    setReauthOpen(false);
    setReauthCode("");
    await unpublish();
  }

  return (
    <>
      {contextHolder}
      <Space size={4}>
        {canReadContent ? (
          <Link href={`/app/manage/resumes/${encodeURIComponent(userId)}/${encodeURIComponent(resumeId)}`}>
            {t("resumes.readContent")}
          </Link>
        ) : null}
        {published && canUnpublish ? (
          <Button danger loading={pending} onClick={() => setReasonOpen(true)} size="small" type="link">{t("resumes.unpublish")}</Button>
        ) : null}
      </Space>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: pending }}
        okText={t("resumes.unpublishConfirm")}
        onCancel={() => setReasonOpen(false)}
        onOk={unpublish}
        open={reasonOpen}
        title={t("resumes.unpublishTitle")}
      >
        <Input.TextArea
          maxLength={240}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("resumes.unpublishReason")}
          rows={3}
          value={reason}
        />
      </Modal>
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
