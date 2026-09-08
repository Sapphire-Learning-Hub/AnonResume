"use client";

import { Button, Input, Modal, Space, message } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

export function AdminUserActions({
  userId,
  suspended,
  canSuspend,
  canRevokeSessions,
}: {
  userId: string;
  suspended: boolean;
  canSuspend: boolean;
  canRevokeSessions: boolean;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [reason, setReason] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [pending, setPending] = useState(false);
  const [deferred, setDeferred] = useState<(() => Promise<void>) | null>(null);

  async function run(request: () => Promise<Response>) {
    setPending(true);
    try {
      const response = await request();
      if (response.status === 428) {
        setDeferred(() => async () => run(request));
        setReauthOpen(true);
        return;
      }
      if (!response.ok) throw new Error(t("common.operationFailed"));
      setSuspendOpen(false);
      setReason("");
      messageApi.success(t("common.operationComplete"));
      router.refresh();
    } catch {
      messageApi.error(t("users.operationFailed"));
    } finally {
      setPending(false);
    }
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
    const action = deferred;
    setDeferred(null);
    await action?.();
  }

  return (
    <>
      {contextHolder}
      <Space size={4}>
        {canSuspend ? (
          suspended ? (
            <Button
              loading={pending}
              onClick={() => run(() => fetch(`/api/manage/users/${userId}/suspension`, { method: "DELETE" }))}
              size="small"
              type="link"
            >{t("users.restore")}</Button>
          ) : (
            <Button danger onClick={() => setSuspendOpen(true)} size="small" type="link">{t("users.suspend")}</Button>
          )
        ) : null}
        {canRevokeSessions ? (
          <Button
            loading={pending}
            onClick={() => run(() => fetch(`/api/manage/users/${userId}/sessions`, { method: "DELETE" }))}
            size="small"
            type="link"
          >{t("users.revokeSessions")}</Button>
        ) : null}
      </Space>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: pending }}
        okText={t("users.suspendConfirm")}
        onCancel={() => setSuspendOpen(false)}
        onOk={() => run(() => fetch(`/api/manage/users/${userId}/suspension`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        }))}
        open={suspendOpen}
        title={t("users.suspendTitle")}
      >
        <Input.TextArea
          maxLength={240}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("users.suspendReason")}
          rows={3}
          value={reason}
        />
      </Modal>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verify")}
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
