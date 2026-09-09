"use client";

import { Button, Input, Modal } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { AdminPagedSelect } from "@/components/admin/AdminPagedSelect";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

export function AdminInviteUser({
  canAssignRole,
}: {
  canAssignRole: boolean;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");

  async function submit() {
    setPending(true);
    const response = await fetch("/api/manage/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, roleId: roleId ?? null }),
    });
    setPending(false);
    if (response.status === 428) {
      setReauthOpen(true);
      return;
    }
    if (!response.ok) {
      toast.error(
        response.status === 409 ? t("invite.conflict") : t("invite.failed"),
      );
      return;
    }
    setOpen(false);
    setName("");
    setEmail("");
    setRoleId(undefined);
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
    setReauthOpen(false);
    setReauthCode("");
    await submit();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="primary">{t("invite.open")}</Button>
      <Modal
        okButtonProps={{ disabled: !name.trim() || !email.trim(), loading: pending }}
        okText={t("invite.send")}
        onCancel={() => setOpen(false)}
        onOk={submit}
        open={open}
        title={t("invite.title")}
      >
        <div className="admin-dialog-form">
          <Input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("invite.name")} value={name} />
          <Input maxLength={254} onChange={(event) => setEmail(event.target.value)} placeholder={t("invite.email")} type="email" value={email} />
          {canAssignRole ? (
            <AdminPagedSelect
              allowClear
              endpoint="/api/manage/roles"
              onChange={setRoleId}
              placeholder={t("invite.role")}
              value={roleId}
            />
          ) : null}
        </div>
      </Modal>
      <Modal
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
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
