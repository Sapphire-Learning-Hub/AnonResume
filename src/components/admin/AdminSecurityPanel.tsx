"use client";

import { Alert, Button, Input, List, Modal, Space, message } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AdminMfaEnrollmentContent,
  type AdminMfaEnrollment,
} from "@/components/admin/AdminMfaEnrollmentContent";
import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

interface MfaDevice {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function getAdminSecurityResponseAction(
  status: number,
  error?: string,
) {
  if (status === 401 && error === "unauthorized") return "verify" as const;
  if (status === 428) return "reauthenticate" as const;
  return "error" as const;
}

export function AdminSecurityPanel({
  devices,
  recoveryRequired,
  recoveryCodesRemaining,
}: {
  devices: MfaDevice[];
  recoveryRequired: boolean;
  recoveryCodesRemaining: number;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<AdminMfaEnrollment>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferred, setDeferred] = useState<(() => Promise<void>)>();

  async function withReauth(action: () => Promise<Response>, onSuccess: (response: Response) => Promise<void>) {
    setPending(true);
    const response = await action();
    setPending(false);
    const body = response.ok
      ? {}
      : ((await response.json().catch(() => ({}))) as { error?: string });
    const responseAction = getAdminSecurityResponseAction(
      response.status,
      body.error,
    );
    if (responseAction === "verify") {
      router.replace("/app");
      return;
    }
    if (responseAction === "reauthenticate") {
      setDeferred(() => async () => withReauth(action, onSuccess));
      setReauthOpen(true);
      return;
    }
    if (!response.ok) {
      messageApi.error(
        body.error === "device_limit"
          ? t("security.deviceLimit")
          : body.error === "device_conflict"
            ? t("security.deviceConflict")
            : body.error === "mfa_locked"
              ? t("auth.mfaLocked")
              : t("common.operationFailed"),
      );
      return;
    }
    await onSuccess(response);
  }

  async function beginEnrollment() {
    await withReauth(
      () => fetch("/api/manage/security/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
      async (response) => {
        setEnrollment((await response.json()) as AdminMfaEnrollment);
        setNameOpen(false);
      },
    );
  }

  async function confirmEnrollment() {
    if (!enrollment) return;
    await withReauth(
      () => fetch("/api/manage/security/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: enrollment.deviceId, code }),
      }),
      async (response) => {
        const body = (await response.json()) as { recoveryCodes: string[] };
        setEnrollment(undefined);
        setCode("");
        setName("");
        if (body.recoveryCodes.length > 0) setRecoveryCodes(body.recoveryCodes);
        messageApi.success(t("security.added"));
        router.refresh();
      },
    );
  }

  async function removeDevice(deviceId: string) {
    await withReauth(
      () => fetch(`/api/manage/security/mfa/${encodeURIComponent(deviceId)}`, { method: "DELETE" }),
      async () => {
        messageApi.success(t("security.removed"));
        router.replace("/app");
        router.refresh();
      },
    );
  }

  async function reauthenticate() {
    setPending(true);
    const response = await fetch("/api/manage/session/reauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: reauthCode }),
    });
    setPending(false);
    const body = response.ok
      ? {}
      : ((await response.json().catch(() => ({}))) as { error?: string });
    if (
      getAdminSecurityResponseAction(response.status, body.error) === "verify"
    ) {
      router.replace("/app");
      return;
    }
    if (!response.ok) {
      messageApi.error(t("common.invalidCode"));
      return;
    }
    const action = deferred;
    setDeferred(undefined);
    setReauthOpen(false);
    setReauthCode("");
    await action?.();
  }

  return (
    <>
      {contextHolder}
      {recoveryRequired ? (
        <Alert
          message={t("security.recoveryRequired")}
          showIcon
          type="warning"
        />
      ) : null}
      <Space style={{ margin: "16px 0" }}>
        <Button onClick={() => setNameOpen(true)} type="primary">{t("security.add")}</Button>
        <span>{t("security.remainingCodes", { count: recoveryCodesRemaining })}</span>
      </Space>
      <List
        bordered
        dataSource={devices}
        renderItem={(device) => (
          <List.Item
            actions={[
              <Button
                danger
                disabled={devices.length <= 1}
                key="remove"
                loading={pending}
                onClick={() => removeDevice(device.id)}
                type="link"
              >{t("security.remove")}</Button>,
            ]}
          >
            <List.Item.Meta
              description={`${t("security.created", { time: new Date(device.createdAt).toLocaleString(locale) })} · ${device.lastUsedAt ? t("security.lastUsed", { time: new Date(device.lastUsedAt).toLocaleString(locale) }) : t("security.neverUsed")}`}
              title={device.name}
            />
          </List.Item>
        )}
      />
      <Modal
        okButtonProps={{ disabled: !name.trim(), loading: pending }}
        onCancel={() => setNameOpen(false)}
        onOk={beginEnrollment}
        open={nameOpen}
        title={t("security.add")}
      >
        <Input maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={t("security.deviceName")} value={name} />
      </Modal>
      <Modal
        okButtonProps={{ disabled: code.length !== 6, loading: pending }}
        onCancel={() => setEnrollment(undefined)}
        onOk={confirmEnrollment}
        open={Boolean(enrollment)}
        title={t("security.scan")}
        width={560}
      >
        {enrollment ? (
          <AdminMfaEnrollmentContent
            code={code}
            enrollment={enrollment}
            onCodeChange={setCode}
          />
        ) : null}
      </Modal>
      <Modal
        cancelButtonProps={{ style: { display: "none" } }}
        okText={t("security.saved")}
        onOk={() => setRecoveryCodes(undefined)}
        open={Boolean(recoveryCodes)}
        title={t("security.recoveryCodes")}
      >
        <p>{t("security.recoveryCodesDescription")}</p>
        <pre>{recoveryCodes?.join("\n")}</pre>
      </Modal>
      <Modal
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
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
