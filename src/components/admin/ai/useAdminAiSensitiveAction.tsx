"use client";

import { Modal } from "antd";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

interface DeferredSensitiveAction {
  request: () => Promise<Response>;
  resolve: (response: Response | null) => void;
}

export function useAdminAiSensitiveAction() {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const { toast } = useAppFeedback();
  const [pending, setPending] = useState(false);
  const [deferredAction, setDeferredAction] = useState<DeferredSensitiveAction>();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");

  async function runSensitive(action: () => Promise<Response>) {
    setPending(true);
    let response: Response;
    try {
      response = await action();
    } catch {
      toast.error(t("ai.failed"));
      return null;
    } finally {
      setPending(false);
    }
    if (response.status === 428) {
      setReauthOpen(true);
      return new Promise<Response | null>((resolve) => {
        setDeferredAction({ request: action, resolve });
      });
    }
    if (!response.ok) {
      toast.error(t("ai.failed"));
      return null;
    }
    return response;
  }

  async function reauthenticate() {
    setPending(true);
    let response: Response;
    try {
      response = await fetch("/api/manage/session/reauth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: reauthCode }),
      });
    } catch {
      toast.error(t("ai.failed"));
      return;
    } finally {
      setPending(false);
    }
    if (!response.ok) {
      toast.error(t("common.invalidCode"));
      return;
    }
    const deferred = deferredAction;
    setDeferredAction(undefined);
    setReauthOpen(false);
    setReauthCode("");
    if (deferred) {
      deferred.resolve(await runSensitive(deferred.request));
    }
  }

  function cancelReauthentication() {
    deferredAction?.resolve(null);
    setDeferredAction(undefined);
    setReauthCode("");
    setReauthOpen(false);
  }

  const reauthModal = (
    <Modal
      cancelText={t("common.cancel")}
      okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
      okText={t("common.verifyContinue")}
      open={reauthOpen}
      title={t("common.reauthTitle")}
      onCancel={cancelReauthentication}
      onOk={() => void reauthenticate()}
    >
      <div className="admin-dialog-form">
        <p className="admin-dialog-description">{t("common.reauthDescription")}</p>
        <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
      </div>
    </Modal>
  );

  return { pending, reauthModal, reauthOpen, runSensitive };
}
