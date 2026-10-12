"use client";

import { Progress } from "antd";

import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import type {
  SystemRestartOperation,
  SystemRestartTarget,
} from "./restart-types";

const consumerOrder = new Map([
  ["pdf-worker", 0],
  ["ai-worker", 1],
  ["web", 2],
]);

function targetStateKey(status: SystemRestartTarget["status"]) {
  return `system.restart.target.${status}` as const;
}

function operationStateKey(status: SystemRestartOperation["status"]) {
  return `system.restart.operation.${status}` as const;
}

export function SystemRestartProgress({
  disconnected,
  operation,
}: {
  disconnected: boolean;
  operation: SystemRestartOperation;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const orderedTargets = [...operation.targets].sort((left, right) =>
    (consumerOrder.get(left.consumer) ?? 99) -
      (consumerOrder.get(right.consumer) ?? 99) ||
    left.sequence - right.sequence,
  );
  const completedTargets = orderedTargets.filter((target) =>
    ["healthy", "failed", "timed_out"].includes(target.status),
  ).length;
  const percent = orderedTargets.length === 0
    ? 0
    : Math.round((completedTargets / orderedTargets.length) * 100);

  return (
    <section className="system-restart-progress" aria-live="polite">
      <header className="system-restart-progress__header">
        <div>
          <strong>{t("system.restart.progressTitle")}</strong>
          <span className="system-restart-progress__summary">
            {t(operationStateKey(operation.status))}
          </span>
        </div>
        <Progress percent={percent} size="small" status={
          operation.status === "failed" || operation.status === "timed_out"
            ? "exception"
            : operation.status === "succeeded"
              ? "success"
              : "active"
        } />
      </header>
      {disconnected ? (
        <div className="system-restart-progress__connection" role="status">
          {t("system.restart.connectionUnavailable")}
        </div>
      ) : null}
      <div className="system-restart-progress__targets">
        {orderedTargets.map((target) => (
          <div
            className="system-restart-target"
            data-status={target.status}
            key={`${target.instanceId}-${target.sequence}`}
          >
            <div className="system-restart-target__identity">
              <strong>{target.consumer}</strong>
              <span>{target.instanceId}</span>
            </div>
            <span className="system-restart-target__state">
              {t(targetStateKey(target.status))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
