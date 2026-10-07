"use client";

import { DownloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Modal, Spin, Tag } from "antd";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";

import { useAccountCenterStyles } from "./AccountCenter.style";

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
  userAgent: string | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error("account_request_failed");
  return response.json() as Promise<T>;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function AccountCenter() {
  const { styles, cx } = useAccountCenterStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [profile, setProfile] = useState<AccountProfile>();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [oldEmailCode, setOldEmailCode] = useState("");
  const [newEmailCode, setNewEmailCode] = useState("");
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionCode, setDeletionCode] = useState("");
  const [deletionCodeSent, setDeletionCodeSent] = useState(false);

  const reportLoadError = useEffectEvent(() => {
    toast.error(t("account.error.load"));
  });
  const loadSessions = useCallback(async () => {
    const result = await requestJson<{ sessions: AccountSession[] }>(
      "/api/account/sessions",
    );
    setSessions(result.sessions);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      requestJson<{ profile: AccountProfile }>("/api/account/profile"),
      requestJson<{ sessions: AccountSession[] }>("/api/account/sessions"),
    ]).then(([profileResult, sessionResult]) => {
      if (!active) return;
      setProfile(profileResult.profile);
      setName(profileResult.profile.name);
      setSessions(sessionResult.sessions);
    }).catch(() => {
      if (active) reportLoadError();
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function runOperation(
    key: string,
    operation: () => Promise<void>,
    success: string,
  ) {
    setBusy(key);
    try {
      await operation();
      toast.success(success);
    } catch {
      toast.error({ key: "account-action-error", content: t("account.error.action") });
    } finally {
      setBusy(undefined);
    }
  }

  async function saveProfile() {
    await runOperation("profile", async () => {
      await requestJson("/api/account/profile", jsonRequest("PATCH", { name }));
      setProfile((current) => current ? { ...current, name } : current);
    }, t("account.profile.saved"));
  }

  async function updatePassword() {
    if (newPassword !== confirmPassword) {
      toast.error(t("account.error.passwordMismatch"));
      return;
    }
    await runOperation("password", async () => {
      await requestJson("/api/account/password", jsonRequest("POST", {
        currentPassword,
        newPassword,
        locale,
      }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }, t("account.password.updated"));
  }

  async function sendEmailCode(stage: "old" | "new") {
    await runOperation(`email-${stage}`, () => requestJson(
      "/api/account/email/challenge",
      jsonRequest("POST", {
        stage,
        newEmail,
        currentPassword: emailPassword,
        locale,
      }),
    ).then(() => undefined), t("account.email.codeSent"));
  }

  async function changeEmail() {
    await runOperation("email-change", async () => {
      await requestJson("/api/account/email", jsonRequest("POST", {
        currentPassword: emailPassword,
        newEmail,
        oldEmailCode,
        newEmailCode,
        locale,
      }));
      setProfile((current) => current ? { ...current, email: newEmail } : current);
      setEmailPassword("");
      setOldEmailCode("");
      setNewEmailCode("");
    }, t("account.email.changed"));
  }

  async function revokeSession(sessionId: string) {
    await runOperation(`session-${sessionId}`, async () => {
      await requestJson("/api/account/sessions", jsonRequest("DELETE", { sessionId }));
      await loadSessions();
    }, t("account.sessions.removed"));
  }

  async function revokeOtherSessions() {
    await runOperation("sessions-other", async () => {
      await requestJson("/api/account/sessions", jsonRequest("POST"));
      await loadSessions();
    }, t("account.sessions.removed"));
  }

  async function sendDeletionCode() {
    await runOperation("deletion-code", async () => {
      await requestJson("/api/account/deletion/challenge", jsonRequest("POST", {
        purpose: "delete",
        password: deletionPassword,
        locale,
      }));
      setDeletionCodeSent(true);
    }, t("account.email.codeSent"));
  }

  async function submitDeletion() {
    await runOperation("deletion-submit", async () => {
      await requestJson("/api/account/deletion", jsonRequest("POST", {
        password: deletionPassword,
        code: deletionCode,
        locale,
      }));
      router.replace("/account-recovery");
      router.refresh();
    }, t("account.deletion.submitted"));
  }

  if (loading) {
    return <div className={styles.loading}><Spin /></div>;
  }
  if (!profile) return null;

  const formattedDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("account.title")}</h1>
        <p className={styles.lead}>{t("account.description")}</p>
      </header>
      <div className={styles.sections}>
        <section aria-labelledby="account-profile-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-profile-title">{t("account.profile.title")}</h2>
            <p className={styles.sectionDescription}>{t("account.profile.description")}</p>
          </div>
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
          <div><Button loading={busy === "profile"} onClick={saveProfile} type="primary">{t("account.profile.save")}</Button></div>
        </section>

        <section aria-labelledby="account-security-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-security-title">{t("account.security.title")}</h2>
            <p className={styles.sectionDescription}>{t("account.security.description")}</p>
          </div>
          <div className={styles.split}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{t("account.password.title")}</h3>
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
                  <div><Button loading={busy === "password"} onClick={updatePassword}>{t("account.password.update")}</Button></div>
                </>
              ) : <p className={styles.muted}>{t("account.password.unavailable")}</p>}
            </div>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{t("account.email.title")}</h3>
              {profile.hasPassword ? <>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-email-password">{t("account.email.password")}</label>
                  <Input.Password id="account-email-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-new-email">{t("account.email.new")}</label>
                  <Input id="account-new-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                </div>
                <div className={styles.actionRow}>
                  <Button loading={busy === "email-old"} onClick={() => sendEmailCode("old")}>{t("account.email.sendOld")}</Button>
                  <Button loading={busy === "email-new"} onClick={() => sendEmailCode("new")}>{t("account.email.sendNew")}</Button>
                </div>
                <div className={styles.split}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="account-old-email-code">{t("account.email.oldCode")}</label>
                    <Input id="account-old-email-code" inputMode="numeric" maxLength={6} value={oldEmailCode} onChange={(event) => setOldEmailCode(event.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="account-new-email-code">{t("account.email.newCode")}</label>
                    <Input id="account-new-email-code" inputMode="numeric" maxLength={6} value={newEmailCode} onChange={(event) => setNewEmailCode(event.target.value)} />
                  </div>
                </div>
                <div><Button loading={busy === "email-change"} onClick={changeEmail} type="primary">{t("account.email.change")}</Button></div>
              </> : <p className={styles.muted}>{t("account.security.passwordRequired")}</p>}
            </div>
          </div>
        </section>

        <section aria-labelledby="account-sessions-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-sessions-title">{t("account.sessions.title")}</h2>
            <p className={styles.sectionDescription}>{t("account.sessions.description")}</p>
          </div>
          <ul className={styles.sessionList}>
            {sessions.map((session) => (
              <li className={styles.session} key={session.id}>
                <div className={styles.sessionInfo}>
                  <strong>{session.userAgent || t("account.sessions.unknownDevice")}</strong>
                  <span className={styles.sessionMeta}>{session.ipAddress || t("account.sessions.unknownIp")}</span>
                  <span className={styles.sessionMeta}>{t("account.sessions.lastActive", { time: formattedDate(session.updatedAt) })}</span>
                </div>
                {session.current ? <Tag color="success">{t("account.sessions.current")}</Tag> : (
                  <Button loading={busy === `session-${session.id}`} onClick={() => revokeSession(session.id)}>{t("account.sessions.remove")}</Button>
                )}
              </li>
            ))}
          </ul>
          <div><Button loading={busy === "sessions-other"} onClick={revokeOtherSessions}>{t("account.sessions.removeOthers")}</Button></div>
        </section>

        <section aria-labelledby="account-data-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="account-data-title">{t("account.data.title")}</h2>
            <p className={styles.sectionDescription}>{t("account.data.description")}</p>
          </div>
          <div className={styles.dataRow}>
            <div>
              <h3 className={styles.panelTitle}>{t("account.export.title")}</h3>
              <p className={styles.muted}>{t("account.export.description")}</p>
            </div>
            <Button aria-label={t("account.export.action")} href={`/api/account/export?locale=${locale}`} icon={<DownloadOutlined aria-hidden="true" />} type="primary">{t("account.export.action")}</Button>
          </div>
          <div className={cx(styles.panel, styles.danger)}>
            <div>
              <h3 className={styles.panelTitle}>{t("account.deletion.title")}</h3>
              <p className={styles.muted}>{t("account.deletion.description")}</p>
            </div>
            {profile.hasPassword ? (
              <div><Button danger onClick={() => setDeletionOpen(true)}>{t("account.deletion.open")}</Button></div>
            ) : <p className={styles.muted}>{t("account.security.passwordRequired")}</p>}
          </div>
        </section>
      </div>

      <Modal footer={null} onCancel={() => setDeletionOpen(false)} open={deletionOpen} title={t("account.deletion.title")}>
        <div className={styles.modalBody}>
          <p className={styles.muted}>{t("account.deletion.exportPrompt")}</p>
          <Button aria-label={t("account.export.action")} href={`/api/account/export?locale=${locale}`} icon={<DownloadOutlined aria-hidden="true" />}>{t("account.export.action")}</Button>
          <Checkbox checked={deletionAcknowledged} onChange={(event) => setDeletionAcknowledged(event.target.checked)}>{t("account.deletion.acknowledge")}</Checkbox>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="account-deletion-password">{t("account.deletion.password")}</label>
            <Input.Password id="account-deletion-password" value={deletionPassword} onChange={(event) => setDeletionPassword(event.target.value)} />
          </div>
          <Button aria-label={t("account.deletion.sendCode")} disabled={!deletionAcknowledged || !deletionPassword} icon={<SafetyCertificateOutlined aria-hidden="true" />} loading={busy === "deletion-code"} onClick={sendDeletionCode}>{t("account.deletion.sendCode")}</Button>
          {deletionCodeSent ? (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="account-deletion-code">{t("account.deletion.code")}</label>
                <Input id="account-deletion-code" inputMode="numeric" maxLength={6} value={deletionCode} onChange={(event) => setDeletionCode(event.target.value)} />
              </div>
              <Button danger disabled={deletionCode.length !== 6} loading={busy === "deletion-submit"} onClick={submitDeletion} type="primary">{t("account.deletion.submit")}</Button>
            </>
          ) : null}
        </div>
      </Modal>
    </main>
  );
}
