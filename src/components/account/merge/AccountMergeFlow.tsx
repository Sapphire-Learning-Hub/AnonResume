"use client";

import { ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { Button, Input, Modal, Radio, Spin } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import {
  AccountRequestError,
  requestAccountJson,
} from "@/components/account/account-request";

import { useAccountMergeFlowStyles } from "./AccountMergeFlow.style";

type MergeChoice = "current" | "target";
type MergePhase = "loading" | "credentials" | "review" | "waiting" | "failed";

type MergeAccountSummary = {
  email: string;
  name: string;
  resumeCount: number;
  loginMethods: string[];
};

type VerifiedMerge = {
  confirmNotBefore: string;
  allowedPrimaryChoices: MergeChoice[];
  defaultPrimaryChoice: MergeChoice;
  requiresAdminMfa: boolean;
  current: MergeAccountSummary;
  target: MergeAccountSummary;
};

type MergeStatus = {
  state: string;
  failureCode?: string | null;
  primary?: { email: string; name: string } | null;
};

type FieldError = "current" | "target" | "mfa" | null;

function request(method: string, body?: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };
}

export function AccountMergeFlow({
  onCancel,
  open,
}: {
  onCancel: () => void;
  open: boolean;
}) {
  const { styles } = useAccountMergeFlowStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [phase, setPhase] = useState<MergePhase>("loading");
  const [requiresAdminMfa, setRequiresAdminMfa] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [targetPassword, setTargetPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [verified, setVerified] = useState<VerifiedMerge>();
  const [primaryChoice, setPrimaryChoice] = useState<MergeChoice>("current");
  const [confirmSeconds, setConfirmSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failureCode, setFailureCode] = useState<string>();

  const completeMerge = useCallback(() => {
    toast.success(t("account.merge.completed"));
    router.replace("/sign-in?accountMerged=1");
    router.refresh();
  }, [router, t, toast]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void requestAccountJson<{ providerId: string; requiresAdminMfa: boolean }>(
      "/api/account/social-merge/intent",
      { signal: controller.signal },
    ).then((metadata) => {
      setRequiresAdminMfa(metadata.requiresAdminMfa);
      setPhase("credentials");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setFailureCode(error instanceof AccountRequestError ? error.code : "unknown");
      setPhase("failed");
    });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (phase !== "review" || !verified || confirmSeconds <= 0) return;
    const timeout = window.setTimeout(() => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(verified.confirmNotBefore).getTime() - Date.now()) / 1_000),
      );
      setConfirmSeconds(remaining);
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [confirmSeconds, phase, verified]);

  useEffect(() => {
    if (!open || phase !== "waiting") return;
    const controller = new AbortController();
    let timeout: number | undefined;
    const poll = async () => {
      try {
        const status = await requestAccountJson<MergeStatus>(
          "/api/account/social-merge/status",
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (status.state === "completed") {
          completeMerge();
          return;
        }
        if (["failed", "expired", "cancelled"].includes(status.state)) {
          setFailureCode(status.failureCode ?? status.state);
          setPhase("failed");
          return;
        }
        timeout = window.setTimeout(() => void poll(), 2_000);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof AccountRequestError && error.code === "unauthorized") {
          router.replace("/sign-in");
          return;
        }
        timeout = window.setTimeout(() => void poll(), 2_000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [completeMerge, open, phase, router]);

  function mergeError(error: unknown) {
    const code = error instanceof AccountRequestError ? error.code : "unknown";
    if (code === "current_password_invalid") {
      setFieldError("current");
      return t("account.merge.error.currentPassword");
    }
    if (code === "target_credentials_invalid") {
      setFieldError("target");
      return t("account.merge.error.targetCredentials");
    }
    if (code === "mfa_invalid" || code === "mfa_required") {
      setFieldError("mfa");
      return t("account.merge.error.mfa");
    }
    if (code === "confirmation_too_early") {
      return t("account.merge.error.tooEarly");
    }
    return t("account.merge.error.generic");
  }

  async function verifyAccounts() {
    setBusy(true);
    setFieldError(null);
    try {
      const result = await requestAccountJson<VerifiedMerge>(
        "/api/account/social-merge/verify",
        request("POST", {
          currentPassword,
          targetEmail,
          targetPassword,
          ...(requiresAdminMfa ? { mfaCode } : {}),
          locale,
        }),
      );
      setVerified(result);
      setPrimaryChoice(result.defaultPrimaryChoice);
      setConfirmSeconds(Math.max(
        0,
        Math.ceil((new Date(result.confirmNotBefore).getTime() - Date.now()) / 1_000),
      ));
      setPhase("review");
    } catch (error) {
      toast.error({
        key: "account-merge-action",
        content: mergeError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (confirmSeconds > 0) return;
    setBusy(true);
    try {
      const status = await requestAccountJson<MergeStatus>(
        "/api/account/social-merge/confirm",
        request("POST", { primaryChoice }),
      );
      if (status.state === "completed") {
        completeMerge();
      } else if (["failed", "expired", "cancelled"].includes(status.state)) {
        setFailureCode(status.failureCode ?? status.state);
        setPhase("failed");
      } else {
        setPhase("waiting");
      }
    } catch (error) {
      toast.error({
        key: "account-merge-action",
        content: mergeError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancelFlow() {
    if (phase !== "review") {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await requestAccountJson(
        "/api/account/social-merge/cancel",
        request("POST"),
      );
      onCancel();
    } catch (error) {
      toast.error({
        key: "account-merge-action",
        content: mergeError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const credentialsReady = currentPassword.length > 0 &&
    targetEmail.length > 0 && targetPassword.length > 0 &&
    (!requiresAdminMfa || mfaCode.length > 0);
  const canDismiss = !busy;

  return (
    <Modal
      cancelText={t("common.cancel")}
      closable={canDismiss}
      footer={phase === "credentials" ? [
        <Button key="cancel" onClick={() => void cancelFlow()}>{t("common.cancel")}</Button>,
        <Button
          disabled={!credentialsReady}
          key="verify"
          loading={busy}
          onClick={() => void verifyAccounts()}
          type="primary"
        >
          {t("account.merge.verify")}
        </Button>,
      ] : phase === "review" ? [
        <Button key="cancel" loading={busy} onClick={() => void cancelFlow()}>
          {t("common.cancel")}
        </Button>,
        <Button
          danger
          disabled={confirmSeconds > 0}
          key="confirm"
          loading={busy}
          onClick={() => void confirmMerge()}
          type="primary"
        >
          {confirmSeconds > 0
            ? t("account.merge.confirmCountdown", { seconds: confirmSeconds })
            : t("account.merge.confirm")}
        </Button>,
      ] : phase === "waiting" ? [
        <Button key="close" onClick={onCancel}>{t("account.merge.leave")}</Button>,
      ] : phase === "failed" ? [
        <Button key="close" onClick={onCancel} type="primary">
          {t("account.merge.return")}
        </Button>,
      ] : null}
      mask={{ closable: false }}
      onCancel={canDismiss ? () => void cancelFlow() : undefined}
      open={open}
      title={t("account.merge.title")}
      width={680}
    >
      {phase === "loading" ? (
        <div className={styles.status} role="status">
          <Spin />
        </div>
      ) : null}

      {phase === "credentials" ? (
        <div className={styles.body}>
          <p className={styles.intro}>{t("account.merge.intro")}</p>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.label}>{t("account.merge.currentPassword")}</span>
              <Input.Password
                aria-label={t("account.merge.currentPassword")}
                status={fieldError === "current" ? "error" : undefined}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              {fieldError === "current" ? (
                <span className={styles.fieldError} role="alert">
                  {t("account.merge.error.currentPassword")}
                </span>
              ) : null}
            </label>
            {requiresAdminMfa ? (
              <label className={styles.field}>
                <span className={styles.label}>{t("account.merge.mfa")}</span>
                <Input
                  aria-label={t("account.merge.mfa")}
                  inputMode="numeric"
                  status={fieldError === "mfa" ? "error" : undefined}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                />
              </label>
            ) : null}
            <label className={styles.field}>
              <span className={styles.label}>{t("account.merge.targetEmail")}</span>
              <Input
                aria-label={t("account.merge.targetEmail")}
                status={fieldError === "target" ? "error" : undefined}
                type="email"
                value={targetEmail}
                onChange={(event) => setTargetEmail(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t("account.merge.targetPassword")}</span>
              <Input.Password
                aria-label={t("account.merge.targetPassword")}
                status={fieldError === "target" ? "error" : undefined}
                value={targetPassword}
                onChange={(event) => setTargetPassword(event.target.value)}
              />
              {fieldError === "target" ? (
                <span className={styles.fieldError} role="alert">
                  {t("account.merge.error.targetCredentials")}
                </span>
              ) : null}
            </label>
          </div>
        </div>
      ) : null}

      {phase === "review" && verified ? (
        <div className={styles.body}>
          <div className={styles.summaryGrid}>
            {renderAccountSummary(
              verified.current,
              t("account.merge.currentAccount"),
            )}
            {renderAccountSummary(
              verified.target,
              t("account.merge.githubAccount"),
            )}
          </div>
          <div className={styles.fields}>
            <span className={styles.label}>{t("account.merge.primaryLabel")}</span>
            <Radio.Group
              className={styles.choices}
              onChange={(event) => setPrimaryChoice(event.target.value as MergeChoice)}
              value={primaryChoice}
            >
              {verified.allowedPrimaryChoices.includes("current") ? (
                <Radio className={styles.choice} value="current">
                  {t("account.merge.keepCurrent")}
                </Radio>
              ) : null}
              {verified.allowedPrimaryChoices.includes("target") ? (
                <Radio className={styles.choice} value="target">
                  {t("account.merge.keepTarget")}
                </Radio>
              ) : null}
            </Radio.Group>
          </div>
          <p className={styles.warning}>{t("account.merge.warning")}</p>
        </div>
      ) : null}

      {phase === "waiting" ? (
        <div className={styles.status} role="status">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
          <h3 className={styles.statusTitle}>{t("account.merge.waitingTitle")}</h3>
          <p className={styles.statusText}>{t("account.merge.waitingBody")}</p>
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className={styles.status} role="status">
          <ExclamationCircleOutlined aria-hidden="true" />
          <h3 className={styles.statusTitle}>{t("account.merge.failedTitle")}</h3>
          <p className={styles.statusText}>
            {failureCode === "active_work_timeout"
              ? t("account.merge.timeoutBody")
              : t("account.merge.failedBody")}
          </p>
        </div>
      ) : null}
    </Modal>
  );

  function renderAccountSummary(account: MergeAccountSummary, label: string) {
    const methods = account.loginMethods.map((method) =>
      method === "credential" ? t("account.merge.methodEmail") : "GitHub"
    ).join(" · ");
    return (
      <section className={styles.summary}>
        <span className={styles.label}>{label}</span>
        <h3 className={styles.summaryTitle}>{account.name}</h3>
        <span className={styles.summaryMeta}>{account.email}</span>
        <span className={styles.summaryMeta}>
          {t("account.merge.resumeCount", { count: account.resumeCount })}
        </span>
        <span className={styles.summaryMeta}>{methods}</span>
      </section>
    );
  }
}
