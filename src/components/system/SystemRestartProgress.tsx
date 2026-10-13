"use client";

import { Progress } from "antd";
import { useEffect, useState } from "react";

import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import type {
  SystemRestartOperation,
  SystemRestartTarget,
} from "./restart-types";
import {
  restartConsumerMessageKey,
  restartConsumerOrder,
} from "./restart-types";

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
  const active = operation.status === "queued" || operation.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const order = new Map(
    restartConsumerOrder.map((consumer, index) => [consumer, index]),
  );
  const orderedTargets = [...operation.targets].sort((left, right) =>
    (order.get(left.consumer) ?? 99) -
      (order.get(right.consumer) ?? 99) ||
    left.sequence - right.sequence,
  );
  const targetGroups = restartConsumerOrder.flatMap((consumer) => {
    const targets = orderedTargets.filter((target) => target.consumer === consumer);
    return targets.length > 0 ? [{ consumer, targets }] : [];
  });
  const completedTargets = orderedTargets.filter((target) =>
    ["healthy", "failed", "timed_out"].includes(target.status),
  ).length;
  const percent = orderedTargets.length === 0
    ? 0
    : Math.round((completedTargets / orderedTargets.length) * 100);
  const endTime = operation.completedAt
    ? new Date(operation.completedAt).getTime()
    : now;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((endTime - new Date(operation.createdAt).getTime()) / 1_000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const duration = minutes > 0
    ? t("system.restart.elapsed.minutes", { minutes, seconds })
    : t("system.restart.elapsed.seconds", { seconds });

  return (
    <section className="system-restart-progress" aria-live="polite">
      <header className="system-restart-progress__header">
        <div>
          <span className="system-restart-progress__summary">
            {t(operationStateKey(operation.status))}
          </span>
          <span className="system-restart-progress__elapsed">
            {t("system.restart.elapsed", { duration })}
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
        {targetGroups.map(({ consumer, targets }) => (
          <section className="system-restart-target-group" key={consumer}>
            <h4>
              {t("system.restart.targetCount", {
                consumer: t(restartConsumerMessageKey(consumer)),
                count: targets.length,
              })}
            </h4>
            <div className="system-restart-target-group__items">
              {targets.map((target) => (
                <div
                  className="system-restart-target"
                  data-status={target.status}
                  key={`${target.instanceId}-${target.sequence}`}
                >
                  <span className="system-restart-target__instance">
                    {target.instanceId}
                  </span>
                  <span className="system-restart-target__state">
                    {t(targetStateKey(target.status))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
