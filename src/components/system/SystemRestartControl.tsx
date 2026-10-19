"use client";

import { managementFetch } from "@/lib/admin/client/request";

import { Button, Modal } from "antd";
import { useEffect, useState } from "react";

import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { AdminConfigurationRuntimeInstance } from "@/lib/admin/query";
import type { SystemRestartOperationView } from "@/lib/runtime/restart/types";

import {
  parseOptionalSystemRestartOperation,
  parseSystemRestartOperation,
  restartConsumerMessageKey,
  restartConsumerOrder,
  type SystemRestartOperation,
} from "./restart-types";
import { SystemRestartProgress } from "./SystemRestartProgress";

const ACTIVE_STATUSES = new Set<SystemRestartOperation["status"]>([
  "queued",
  "running",
]);

function createIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

function unsupportedMessageKey(runtime: AdminConfigurationRuntimeInstance) {
  return runtime.supervisorKind === "container"
    ? "system.restart.unsupported.container" as const
    : "system.restart.unsupported.manual" as const;
}

export function SystemRestartControl({
  canRestart,
  initialOperation,
  pollBaseDelayMs = 2_000,
  runtimes,
}: {
  canRestart: boolean;
  initialOperation: SystemRestartOperationView | null;
  pollBaseDelayMs?: number;
  runtimes: AdminConfigurationRuntimeInstance[];
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const { toast } = useAppFeedback();
  const { pending, reauthModal, runSensitive } = useAdminAiSensitiveAction();
  const [operation, setOperation] = useState<SystemRestartOperation | null>(() =>
    initialOperation ? parseSystemRestartOperation(initialOperation) : null,
  );
  const [progressOpen, setProgressOpen] = useState(() =>
    initialOperation
      ? ACTIVE_STATUSES.has(parseSystemRestartOperation(initialOperation).status)
      : false,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [disconnected, setDisconnected] = useState(false);
  const pendingRuntimes = runtimes.filter(
    (runtime) => runtime.state === "pending_restart",
  );
  const pendingConsumerCounts = restartConsumerOrder.flatMap((consumer) => {
    const count = pendingRuntimes.filter(
      (runtime) => runtime.consumer === consumer,
    ).length;
    return count > 0 ? [{ consumer, count }] : [];
  });
  const unsupportedRuntime = pendingRuntimes.find(
    (runtime) => !runtime.onlineRestartSupported,
  );
  const active = operation ? ACTIVE_STATUSES.has(operation.status) : false;
  const disabled =
    pending ||
    active ||
    !canRestart ||
    pendingRuntimes.length === 0 ||
    Boolean(unsupportedRuntime);

  useEffect(() => {
    if (!confirmOpen) return;
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [confirmOpen]);

  useEffect(() => {
    if (!operation || !ACTIVE_STATUSES.has(operation.status)) return;
    let cancelled = false;
    let retryCount = 0;
    let timer: number | undefined;

    const schedule = () => {
      const delay = Math.min(pollBaseDelayMs * (2 ** retryCount), 15_000);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const response = await managementFetch("/api/manage/system/restarts/current", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("restart_status_unavailable");
        const current = parseOptionalSystemRestartOperation(await response.json());
        if (cancelled) return;
        setDisconnected(false);
        retryCount = 0;
        setOperation(current);
        if (current && ACTIVE_STATUSES.has(current.status)) schedule();
      } catch {
        if (cancelled) return;
        setDisconnected(true);
        retryCount += 1;
        schedule();
      }
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [operation, pollBaseDelayMs]);

  function openConfirmation() {
    setCountdown(5);
    setConfirmOpen(true);
  }

  async function createRestartOperation() {
    const response = await runSensitive(() =>
      managementFetch("/api/manage/system/restarts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: createIdempotencyKey() }),
      }),
    );
    if (!response) return;
    try {
      const created = parseSystemRestartOperation(await response.json());
      setOperation(created);
      setProgressOpen(true);
      setDisconnected(false);
      setConfirmOpen(false);
      toast.success(t("system.restart.created"));
    } catch {
      toast.error(t("system.restart.createFailed"));
    }
  }

  const reason = unsupportedRuntime
    ? t(unsupportedMessageKey(unsupportedRuntime))
    : !canRestart
      ? t("system.restart.permissionRequired")
      : pendingRuntimes.length === 0
        ? t("system.restart.noPendingConfiguration")
        : null;

  return (
    <div className="system-restart-control">
      <div className="system-restart-control__action">
        <Button disabled={disabled} type="primary" onClick={openConfirmation}>
          {t("system.restart.apply")}
        </Button>
        {reason ? <span>{reason}</span> : null}
      </div>
      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: countdown > 0, danger: true, loading: pending }}
        okText={countdown > 0
          ? t("system.restart.confirmCountdown", { seconds: countdown })
          : t("system.restart.confirm")}
        open={confirmOpen}
        title={t("system.restart.confirmTitle")}
        onCancel={() => setConfirmOpen(false)}
        onOk={() => void createRestartOperation()}
      >
        <p>{t("system.restart.confirmDescription")}</p>
        <div className="system-restart-confirmation">
          <strong>{t("system.restart.affectedTargets")}</strong>
          <ul>
            {pendingConsumerCounts.map(({ consumer, count }) => (
              <li key={consumer}>
                {t("system.restart.targetCount", {
                  consumer: t(restartConsumerMessageKey(consumer)),
                  count,
                })}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
      <Modal
        centered
        closable={!active}
        footer={active ? null : (
          <Button type="primary" onClick={() => setProgressOpen(false)}>
            {t("common.close")}
          </Button>
        )}
        keyboard={!active}
        mask={{ closable: !active }}
        open={progressOpen && Boolean(operation)}
        title={t("system.restart.progressTitle")}
        width={900}
        onCancel={() => {
          if (!active) setProgressOpen(false);
        }}
      >
        {operation ? (
          <SystemRestartProgress disconnected={disconnected} operation={operation} />
        ) : null}
      </Modal>
      {reauthModal}
    </div>
  );
}
