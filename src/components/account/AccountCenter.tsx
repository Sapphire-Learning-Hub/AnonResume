"use client";

import {
  DatabaseOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  LaptopOutlined,
  LockOutlined,
  MailOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Input, Modal, Spin, Tag } from "antd";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useVerificationCooldown } from "@/components/ui/useVerificationCooldown";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { AccountSessionDevice } from "@/lib/auth/account/session-device";

import {
  accountRequestErrorMessage,
  requestAccountJson,
} from "./account-request";
import { useAccountCenterStyles } from "./AccountCenter.style";
import { EmailChangeFlow } from "./EmailChangeFlow";

type AccountProfile = {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  name: string;
};

type AccountSession = {
  id: string;
  current: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  device: AccountSessionDevice;
};

type AccountSection = "profile" | "password" | "email" | "sessions" | "data";
type AccountLoadState = "loading" | "ready" | "error";

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string;

function sessionDeviceName(device: AccountSessionDevice, t: Translate) {
  if (device.model === "Macintosh") return t("account.sessions.device.mac");
  if (device.model) {
    const includeVendor = device.vendor &&
      device.vendor !== "Apple" &&
      !device.model.toLowerCase().includes(device.vendor.toLowerCase());
    return includeVendor ? `${device.vendor} ${device.model}` : device.model;
  }
  if (device.type === "desktop") {
    if (device.os?.name === "Windows") {
      return t("account.sessions.device.windows");
    }
    if (device.os?.name === "macOS") {
      return t("account.sessions.device.mac");
    }
    if (device.os?.name === "Linux" || device.os?.name === "Ubuntu") {
      return t("account.sessions.device.linux");
    }
  }
  const typeKey = {
    console: "account.sessions.device.console",
    desktop: "account.sessions.device.desktop",
    embedded: "account.sessions.device.embedded",
    mobile: "account.sessions.device.mobile",
    smarttv: "account.sessions.device.smarttv",
    tablet: "account.sessions.device.tablet",
    unknown: "account.sessions.unknownDevice",
    wearable: "account.sessions.device.wearable",
  } satisfies Record<AccountSessionDevice["type"], MessageKey>;
  return t(typeKey[device.type]);
}

function sessionDeviceDetails(device: AccountSessionDevice, t: Translate) {
  const osVersion = device.os?.version
    ? device.os.versionIsMinimum
      ? t("account.sessions.device.orLater", { version: device.os.version })
      : device.os.version
    : null;
  const os = device.os
    ? [device.os.name, osVersion].filter(Boolean).join(" ")
    : null;
  return os || "";
}

export function AccountCenter() {
  const { styles } = useAccountCenterStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [profile, setProfile] = useState<AccountProfile>();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [profileState, setProfileState] = useState<AccountLoadState>("loading");
  const [sessionsState, setSessionsState] = useState<AccountLoadState>("loading");
  const [busy, setBusy] = useState<string>();
  const [activeSection, setActiveSection] = useState<AccountSection>("profile");
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletionWarningOpen, setDeletionWarningOpen] = useState(false);
  const [deletionWarningSeconds, setDeletionWarningSeconds] = useState(0);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionCode, setDeletionCode] = useState("");
  const [deletionCodeSent, setDeletionCodeSent] = useState(false);
  const deletionCooldown = useVerificationCooldown();

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestAccountJson<{ profile: AccountProfile }>(
        "/api/account/profile",
        signal ? { signal } : undefined,
      );
      setProfile(result.profile);
      setName(result.profile.name);
      setProfileState("ready");
    } catch {
      if (!signal?.aborted) setProfileState("error");
    }
  }, []);
  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await requestAccountJson<{ sessions: AccountSession[] }>(
        "/api/account/sessions",
        signal ? { signal } : undefined,
      );
      setSessions(result.sessions);
      setSessionsState("ready");
    } catch {
      if (!signal?.aborted) setSessionsState("error");
    }
  }, []);
  const retryProfile = useCallback(async () => {
    setProfileState("loading");
    await loadProfile();
  }, [loadProfile]);
  const retrySessions = useCallback(async () => {
    setSessionsState("loading");
    await loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const controller = new AbortController();
    void requestAccountJson<{ profile: AccountProfile }>(
      "/api/account/profile",
      { signal: controller.signal },
    ).then((result) => {
      setProfile(result.profile);
      setName(result.profile.name);
      setProfileState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setProfileState("error");
    });
    void requestAccountJson<{ sessions: AccountSession[] }>(
      "/api/account/sessions",
      { signal: controller.signal },
    ).then((result) => {
      setSessions(result.sessions);
      setSessionsState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setSessionsState("error");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!deletionWarningOpen || deletionWarningSeconds <= 0) return;
    const timeout = window.setTimeout(() => {
      setDeletionWarningSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [deletionWarningOpen, deletionWarningSeconds]);

  async function runOperation(
    key: string,
    operation: () => Promise<void>,
    success: string,
  ) {
    setBusy(key);
    try {
      await operation();
      toast.success(success);
    } catch (error) {
      toast.error({
        key: "account-action-error",
        content: accountRequestErrorMessage(error, t),
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function saveProfile() {
    await runOperation("profile", async () => {
      await requestAccountJson("/api/account/profile", jsonRequest("PATCH", { name }));
      setProfile((current) => current ? { ...current, name } : current);
    }, t("account.profile.saved"));
  }

  async function updatePassword() {
    if (newPassword !== confirmPassword) {
      toast.error(t("account.error.passwordMismatch"));
      return;
    }
    await runOperation("password", async () => {
      await requestAccountJson("/api/account/password", jsonRequest("POST", {
        currentPassword,
        newPassword,
        locale,
      }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, t("account.password.updated"));
  }

  async function revokeSession(sessionId: string) {
    await runOperation(`session-${sessionId}`, async () => {
      await requestAccountJson("/api/account/sessions", jsonRequest("DELETE", { sessionId }));
      await retrySessions();
    }, t("account.sessions.removed"));
  }

  async function revokeOtherSessions() {
    await runOperation("sessions-other", async () => {
      await requestAccountJson("/api/account/sessions", jsonRequest("POST"));
      await retrySessions();
    }, t("account.sessions.removed"));
  }

  async function sendDeletionCode() {
    await runOperation("deletion-code", async () => {
      const challenge = await requestAccountJson<{
        resendAvailableAt?: string;
      }>(
        "/api/account/deletion/challenge",
        jsonRequest("POST", {
          purpose: "delete",
          password: deletionPassword,
          locale,
        }),
      );
      deletionCooldown.startCooldown(challenge.resendAvailableAt);
      setDeletionCodeSent(true);
    }, t("account.email.codeSent"));
  }

  async function submitDeletion() {
    await runOperation("deletion-submit", async () => {
      await requestAccountJson("/api/account/deletion", jsonRequest("POST", {
        password: deletionPassword,
        code: deletionCode,
        locale,
      }));
      router.replace("/account-recovery");
      router.refresh();
    }, t("account.deletion.submitted"));
  }

  function openDeletionWarning() {
    setDeletionWarningSeconds(5);
    setDeletionWarningOpen(true);
  }

  function continueToDeletionVerification() {
    if (deletionWarningSeconds > 0) return;
    setDeletionWarningOpen(false);
    setDeletionOpen(true);
  }

  const formattedDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  const navigationItems = [
    {
      id: "profile",
      label: t("account.profile.title"),
      icon: <UserOutlined aria-hidden="true" />,
    },
    {
      id: "password",
      label: t("account.password.title"),
      icon: <LockOutlined aria-hidden="true" />,
    },
    {
      id: "email",
      label: t("account.email.title"),
      icon: <MailOutlined aria-hidden="true" />,
    },
    {
      id: "sessions",
      label: t("account.sessions.title"),
      icon: <LaptopOutlined aria-hidden="true" />,
    },
    {
      id: "data",
      label: t("account.data.title"),
      icon: <DatabaseOutlined aria-hidden="true" />,
    },
  ] satisfies ReadonlyArray<{
    id: AccountSection;
    label: string;
    icon: ReactNode;
  }>;

  const sectionLoading = (
    <div aria-label={t("account.loading")} className={styles.sectionLoading} role="status">
      <Spin size="small" />
    </div>
  );
  const sectionError = (
    message: string,
    action: string,
    retry: () => Promise<void>,
  ) => (
    <div className={styles.sectionError} role="status">
      <ExclamationCircleOutlined aria-hidden="true" className={styles.sectionErrorIcon} />
      <span>{message}</span>
      <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={() => void retry()}>
        {action}
      </Button>
    </div>
  );
  const profileFallback = profileState === "loading"
    ? sectionLoading
    : sectionError(
      t("account.error.profileLoad"),
      t("account.error.retryProfile"),
      retryProfile,
    );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("account.title")}</h1>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <nav aria-label={t("account.navigation")} className={styles.navigation}>
            {navigationItems.map((item) => (
              <button
                aria-controls={`account-${item.id}-section`}
                aria-current={activeSection === item.id ? "page" : undefined}
                className={styles.navigationItem}
                data-active={activeSection === item.id}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                type="button"
              >
                <span className={styles.navigationIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className={styles.content}>
          {activeSection === "profile" ? (
            <section aria-labelledby="account-profile-title" className={styles.section} id="account-profile-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-profile-title">{t("account.profile.title")}</h2>
          </div>
          {profileState === "ready" && profile ? <>
          <div className={styles.split}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="account-name">{t("account.profile.name")}</label>
              <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="account-email">{t("account.profile.email")}</label>
              <Input disabled id="account-email" value={profile.email} />
            </div>
          </div>
          <div className={styles.actionRow}><Button loading={busy === "profile"} onClick={saveProfile} type="primary">{t("account.profile.save")}</Button></div>
          </> : profileFallback}
            </section>
          ) : null}

          {activeSection === "password" ? (
            <section aria-labelledby="account-password-title" className={styles.section} id="account-password-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-password-title">{t("account.password.title")}</h2>
          </div>
          {profileState === "ready" && profile ? <div className={styles.formPanel}>
            {profile.hasPassword ? (
              <>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-current-password">{t("account.password.current")}</label>
                  <Input.Password id="account-current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-new-password">{t("account.password.new")}</label>
                  <Input.Password id="account-new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-confirm-password">{t("account.password.confirm")}</label>
                  <Input.Password id="account-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </div>
                <div className={styles.actionRow}><Button loading={busy === "password"} onClick={updatePassword} type="primary">{t("account.password.update")}</Button></div>
              </>
            ) : <p className={styles.muted}>{t("account.password.unavailable")}</p>}
          </div> : profileFallback}
            </section>
          ) : null}

          {activeSection === "email" ? (
            <section aria-labelledby="account-email-title" className={styles.section} id="account-email-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-email-title">{t("account.email.title")}</h2>
          </div>
          {profileState === "ready" && profile ? <EmailChangeFlow
            hasPassword={profile.hasPassword}
            onEmailChanged={(email) => setProfile((current) => current
              ? { ...current, email }
              : current)}
          /> : profileFallback}
            </section>
          ) : null}

          {activeSection === "sessions" ? (
            <section aria-labelledby="account-sessions-title" className={styles.section} id="account-sessions-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-sessions-title">{t("account.sessions.title")}</h2>
          </div>
          {sessionsState === "loading" ? sectionLoading : sessionsState === "error" ? sectionError(
            t("account.error.sessionsLoad"),
            t("account.error.retrySessions"),
            retrySessions,
          ) : <>
          <ul className={styles.sessionList}>
            {sessions.map((session) => {
              const deviceDetails = sessionDeviceDetails(session.device, t);
              return (
                <li className={styles.session} key={session.id}>
                  <div className={styles.sessionInfo}>
                    <strong>{sessionDeviceName(session.device, t)}</strong>
                    {deviceDetails ? (
                      <span className={styles.sessionMeta}>{deviceDetails}</span>
                    ) : null}
                    <span className={styles.sessionMeta}>{session.ipAddress || t("account.sessions.unknownIp")}</span>
                    <span className={styles.sessionMeta}>{t("account.sessions.lastActive", { time: formattedDate(session.updatedAt) })}</span>
                  </div>
                  {session.current ? <Tag color="success">{t("account.sessions.current")}</Tag> : (
                    <Button loading={busy === `session-${session.id}`} onClick={() => revokeSession(session.id)}>{t("account.sessions.remove")}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={styles.actionRow}><Button loading={busy === "sessions-other"} onClick={revokeOtherSessions}>{t("account.sessions.removeOthers")}</Button></div>
          </>}
            </section>
          ) : null}

          {activeSection === "data" ? (
            <section aria-labelledby="account-data-title" className={styles.section} id="account-data-section">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-data-title">{t("account.data.title")}</h2>
          </div>
          <div className={styles.dataRow}>
            <h3 className={styles.panelTitle}>{t("account.export.title")}</h3>
            <Button aria-label={t("account.export.action")} href={`/api/account/export?locale=${locale}`} icon={<DownloadOutlined aria-hidden="true" />} type="primary">{t("account.export.action")}</Button>
          </div>
          <div className={styles.dangerPanel}>
            <h3 className={styles.panelTitle}>{t("account.deletion.title")}</h3>
            {profileState !== "ready" || !profile ? profileFallback : profile.hasPassword ? (
              <div className={styles.actionRow}><Button danger onClick={openDeletionWarning}>{t("account.deletion.open")}</Button></div>
            ) : <p className={styles.muted}>{t("account.security.passwordRequired")}</p>}
          </div>
            </section>
          ) : null}
        </div>
      </div>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ danger: true, disabled: deletionWarningSeconds > 0 }}
        okText={deletionWarningSeconds > 0
          ? t("account.deletion.warningCountdown", { seconds: deletionWarningSeconds })
          : t("account.deletion.warningContinue")}
        onCancel={() => setDeletionWarningOpen(false)}
        onOk={continueToDeletionVerification}
        open={deletionWarningOpen}
        title={t("account.deletion.warningTitle")}
      >
        <div className={styles.modalBody}>
          <p className={styles.warningText}>{t("account.deletion.warningBody")}</p>
          <p className={styles.warningText}>{t("account.deletion.exportPrompt")}</p>
        </div>
      </Modal>

      <Modal footer={null} onCancel={() => setDeletionOpen(false)} open={deletionOpen} title={t("account.deletion.title")}>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="account-deletion-password">{t("account.deletion.password")}</label>
            <Input.Password id="account-deletion-password" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} />
          </div>
          {!deletionCodeSent ? (
            <div className={styles.deletionActionRow}>
              <Checkbox checked={deletionAcknowledged} onChange={(event) => setDeletionAcknowledged(event.target.checked)}>{t("account.deletion.acknowledge")}</Checkbox>
              <Button aria-label={t("account.deletion.sendCode")} disabled={!deletionAcknowledged || !deletionPassword} icon={<SafetyCertificateOutlined aria-hidden="true" />} loading={busy === "deletion-code"} onClick={sendDeletionCode}>{t("account.deletion.sendCode")}</Button>
            </div>
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="account-deletion-code">{t("account.deletion.code")}</label>
                <div className={styles.verificationInputRow}>
                  <Input id="account-deletion-code" inputMode="numeric" maxLength={6} value={deletionCode} onChange={(event) => setDeletionCode(event.target.value)} />
                  <Button aria-label={deletionCooldown.remainingSeconds > 0 ? undefined : t("account.deletion.sendCode")} disabled={deletionCooldown.remainingSeconds > 0} icon={<SafetyCertificateOutlined aria-hidden="true" />} loading={busy === "deletion-code"} onClick={sendDeletionCode}>
                    {deletionCooldown.remainingSeconds > 0
                      ? t("common.resendAvailableIn", { seconds: deletionCooldown.remainingSeconds })
                      : t("account.email.resendCurrent")}
                  </Button>
                </div>
              </div>
              <div className={styles.deletionActionRow}>
                <Checkbox checked={deletionAcknowledged} onChange={(event) => setDeletionAcknowledged(event.target.checked)}>{t("account.deletion.acknowledge")}</Checkbox>
                <Button danger disabled={deletionCode.length !== 6} loading={busy === "deletion-submit"} onClick={submitDeletion} type="primary">{t("account.deletion.submit")}</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </main>
  );
}
