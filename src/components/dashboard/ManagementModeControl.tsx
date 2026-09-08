"use client";

import { Alert, Button, Modal, Spin } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type AdminMfaEnrollment,
  AdminMfaEnrollmentContent,
} from "@/components/admin/AdminMfaEnrollmentContent";
import { ManagementMfaChallenge } from "@/components/admin/ManagementMfaChallenge";
import { AdminRecoveryCodesPanel } from "@/components/admin/AdminRecoveryCodesPanel";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ css }) => ({
  enrollmentForm: css`
    display: grid;
    gap: 16px;
  `,
  loading: css`
    display: grid;
    min-height: 240px;
    place-items: center;
  `,
}));

export function ManagementModeControl({
  email = "",
  enrollmentRequired = false,
  state,
}: {
  email?: string;
  enrollmentRequired?: boolean;
  state: "active" | "available";
}) {
  const { styles } = useStyles();
  const router = useRouter();
  const { locale, t } = useI18n();
  const adminT = createAdminTranslator(locale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [enrollment, setEnrollment] = useState<AdminMfaEnrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openManagementMode() {
    setEnrollment(null);
    setEnrollmentCode("");
    setRecoveryCodes(null);
    setOpen(true);
    setError(null);
    if (!enrollmentRequired) return;

    setPending(true);
    try {
      const response = await fetch("/api/manage/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "begin_enrollment",
          deviceName: adminT("security.defaultDeviceName"),
        }),
      });
      const body = (await response.json()) as AdminMfaEnrollment & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setEnrollment(body);
    } catch {
      setError(adminT("common.operationFailed"));
    } finally {
      setPending(false);
    }
  }

  async function completeEnrollment(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/manage/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete_enrollment",
          code: enrollmentCode,
          deviceId: enrollment.deviceId,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        recoveryCodes?: string[];
      };
      if (!response.ok || !body.recoveryCodes?.length) {
        throw new Error(body.error);
      }
      setRecoveryCodes(body.recoveryCodes);
    } catch {
      setError(adminT("common.invalidCode"));
    } finally {
      setPending(false);
    }
  }

  function enterManagementMode() {
    setOpen(false);
    router.replace("/app/manage");
    router.refresh();
  }

  function closeManagementMode() {
    if (pending || recoveryCodes) return;
    setOpen(false);
    setEnrollment(null);
    setEnrollmentCode("");
    setError(null);
  }

  async function exitManagementMode() {
    setPending(true);
    try {
      await fetch("/api/manage/session", { method: "DELETE" });
      router.replace("/app");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (state === "active") {
    return (
      <Button loading={pending} onClick={exitManagementMode}>
        {t("management.exit")}
      </Button>
    );
  }

  return (
    <>
      <Button onClick={openManagementMode}>{t("management.enter")}</Button>
      <Modal
        closable={!pending && !recoveryCodes}
        destroyOnHidden
        footer={null}
        mask={{ closable: !pending && !recoveryCodes }}
        onCancel={closeManagementMode}
        open={open}
        title={
          recoveryCodes
            ? null
            : enrollmentRequired
              ? adminT("activation.bindMfa")
              : adminT("auth.mfaTitle")
        }
        width={enrollmentRequired ? 560 : 480}
      >
        {enrollmentRequired ? (
          recoveryCodes ? (
            <AdminRecoveryCodesPanel
              codes={recoveryCodes}
              continueLabel={adminT("auth.enterConsole")}
              email={email}
              onContinue={enterManagementMode}
            />
          ) : pending && !enrollment ? (
            <div className={styles.loading}>
              <Spin />
            </div>
          ) : enrollment ? (
            <form className={styles.enrollmentForm} onSubmit={completeEnrollment}>
              {error ? <Alert message={error} showIcon type="error" /> : null}
              <AdminMfaEnrollmentContent
                code={enrollmentCode}
                enrollment={enrollment}
                onCodeChange={setEnrollmentCode}
              />
              <Button
                disabled={enrollmentCode.length !== 6}
                htmlType="submit"
                loading={pending}
                size="large"
                type="primary"
              >
                {adminT("activation.complete")}
              </Button>
            </form>
          ) : (
            <Alert
              message={error ?? adminT("common.operationFailed")}
              showIcon
              type="error"
            />
          )
        ) : (
          <>
            <p>{adminT("auth.mfaDescription")}</p>
            <ManagementMfaChallenge
              onSuccess={({ recoveryRequired }) => {
                setOpen(false);
                router.replace(
                  recoveryRequired ? "/app/manage/security" : "/app/manage",
                );
                router.refresh();
              }}
              presentation="modal"
            />
          </>
        )}
      </Modal>
    </>
  );
}
