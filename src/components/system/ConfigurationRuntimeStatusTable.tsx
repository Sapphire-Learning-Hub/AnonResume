import { Button } from "antd";

import {
  AdminStatus,
  AdminTable,
} from "@/components/admin/AdminPage";
import type {
  AdminConfigurationRuntimeInstance,
  AdminConfigurationRuntimeStatus,
} from "@/lib/admin/query";

const statusTones: Record<
  AdminConfigurationRuntimeStatus,
  "danger" | "success" | "warning"
> = {
  current: "success",
  error: "danger",
  pending_restart: "warning",
  recovery_required: "danger",
  stale: "danger",
};

export function ConfigurationRuntimeStatusTable({
  locale,
  recoveryHref,
  states,
  text,
}: {
  locale: string;
  recoveryHref: string;
  states: AdminConfigurationRuntimeInstance[];
  text: {
    consumer: string;
    desiredVersion: string;
    error: string;
    fallbackVersion: string;
    historyAction: string;
    hotVersion: string;
    instance: string;
    lastSync: string;
    release: string;
    restartVersion: string;
    state: string;
    states: Record<AdminConfigurationRuntimeStatus, string>;
    unknown: string;
  };
}) {
  const needsRecovery = states.some(
    (state) => state.state === "recovery_required" || state.state === "error",
  );
  const version = (value: number | null) => value ?? text.unknown;

  return (
    <>
      {needsRecovery ? (
        <div className="admin-runtime-recovery-action">
          <Button href={recoveryHref} type="primary">
            {text.historyAction}
          </Button>
        </div>
      ) : null}
      <AdminTable
        headers={[
          text.instance,
          text.consumer,
          text.release,
          text.desiredVersion,
          text.hotVersion,
          text.restartVersion,
          text.fallbackVersion,
          text.lastSync,
          text.state,
          text.error,
        ]}
        rows={states.map((runtime) => [
          runtime.instanceId,
          runtime.consumer,
          runtime.release,
          version(runtime.desiredVersion),
          version(runtime.loadedHotVersion),
          version(runtime.loadedRestartVersion),
          version(runtime.fallbackVersion),
          runtime.lastSeenAt.toLocaleString(locale),
          <AdminStatus key={`${runtime.instanceId}-status`} tone={statusTones[runtime.state]}>
            {text.states[runtime.state]}
          </AdminStatus>,
          runtime.errorCode ?? text.unknown,
        ])}
      />
    </>
  );
}
