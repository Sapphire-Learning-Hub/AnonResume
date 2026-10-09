"use client";

import {
  ExclamationCircleOutlined,
  GithubOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Modal, Spin, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";

import { useAccountCenterStyles } from "./AccountCenter.style";

type LinkedAccount = {
  id: string;
  providerId: string;
};

type LoadState = "loading" | "ready" | "error";

export function ConnectedAccounts() {
  const { styles } = useAccountCenterStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await authClient.listAccounts();
      if (result.error || !result.data) {
        setLoadState("error");
        return;
      }
      setAccounts(result.data);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void authClient.listAccounts().then((result) => {
      if (result.error || !result.data) {
        setLoadState("error");
        return;
      }
      setAccounts(result.data);
      setLoadState("ready");
    }).catch(() => setLoadState("error"));
  }, []);

  const githubAccount = accounts.find((account) => account.providerId === "github");
  const canUnlink = accounts.some((account) => account.providerId !== "github");

  async function linkGitHub() {
    setBusy(true);
    try {
      const attemptResponse = await fetch("/api/account/social-link/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "github" }),
      });
      const attempt = await attemptResponse.json() as {
        callbackURL?: string;
        errorCallbackURL?: string;
      };
      if (
        !attemptResponse.ok ||
        !attempt.callbackURL ||
        !attempt.errorCallbackURL
      ) {
        throw new Error("link attempt failed");
      }
      const result = await authClient.linkSocial({
        callbackURL: attempt.callbackURL,
        errorCallbackURL: attempt.errorCallbackURL,
        provider: "github",
      });
      if (result.error) {
        toast.error({
          key: "account-connections-action",
          content: t("account.connections.actionFailed"),
        });
      }
    } catch {
      toast.error({
        key: "account-connections-action",
        content: t("account.connections.actionFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function unlinkGitHub() {
    if (!githubAccount || !canUnlink) return;
    setBusy(true);
    try {
      const result = await authClient.unlinkAccount({
        accountId: githubAccount.id,
      });
      if (result.error) {
        throw new Error("unlink failed");
      }
      setUnlinkOpen(false);
      await loadAccounts();
      toast.success(t("account.connections.disconnected"));
    } catch {
      toast.error({
        key: "account-connections-action",
        content: t("account.connections.actionFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  if (loadState === "loading") {
    return (
      <div aria-label={t("account.loading")} className={styles.sectionLoading} role="status">
        <Spin size="small" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className={styles.sectionError} role="status">
        <ExclamationCircleOutlined aria-hidden="true" className={styles.sectionErrorIcon} />
        <span>{t("account.connections.loadFailed")}</span>
        <Button
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={() => {
            setLoadState("loading");
            void loadAccounts();
          }}
        >
          {t("account.connections.retry")}
        </Button>
      </div>
    );
  }

  const unlinkButton = (
    <Button
      aria-label={t("account.connections.disconnectLabel")}
      danger
      disabled={!canUnlink}
      onClick={() => setUnlinkOpen(true)}
    >
      {t("account.connections.disconnect")}
    </Button>
  );

  return (
    <>
      <ul className={styles.connectionList}>
        <li className={styles.connection}>
          <div className={styles.connectionIdentity}>
            <span className={styles.connectionIcon}>
              <GithubOutlined aria-hidden="true" />
            </span>
            <strong>{t("account.connections.github")}</strong>
            <Tag color={githubAccount ? "success" : "default"}>
              {githubAccount
                ? t("account.connections.connected")
                : t("account.connections.notConnected")}
            </Tag>
          </div>
          {githubAccount ? (
            canUnlink ? unlinkButton : (
              <Tooltip title={t("account.connections.lastMethod")}>
                <span>{unlinkButton}</span>
              </Tooltip>
            )
          ) : (
            <Button loading={busy} onClick={() => void linkGitHub()} type="primary">
              {t("account.connections.connect")}
            </Button>
          )}
        </li>
      </ul>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ danger: true }}
        okText={t("account.connections.disconnect")}
        onCancel={() => setUnlinkOpen(false)}
        onOk={() => void unlinkGitHub()}
        open={unlinkOpen}
        confirmLoading={busy}
        title={t("account.connections.disconnectTitle")}
      >
        <p className={styles.warningText}>{t("account.connections.disconnectBody")}</p>
      </Modal>
    </>
  );
}
