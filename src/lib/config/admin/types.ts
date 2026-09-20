import type { ConfigApplyMode, ConfigConsumer, ConfigGroup } from "@/lib/config/types";
import type { ConfigKey } from "@/lib/config/registry";

export interface ManagedConfigFieldView {
  applyMode: ConfigApplyMode;
  changed: boolean;
  configured: boolean;
  consumers: readonly ConfigConsumer[];
  group: ConfigGroup;
  key: ConfigKey;
  public: boolean;
  sensitive: boolean;
  value?: boolean | number | string | string[];
}

export interface ManagedConfigurationRevisionView {
  changes: ManagedConfigurationHistoryChange[];
  createdAt: string;
  createdByUserId: string;
  id: string;
  publishedAt: string | null;
  publishedByUserId: string | null;
  status: "active" | "draft" | "superseded";
  summary: string | null;
  updatedAt: string;
  version: number;
}

export type ManagedConfigurationHistoryChange =
  | {
      after: unknown;
      before: unknown;
      field: string;
      sensitive?: false;
    }
  | {
      field: string;
      operation: "clear" | "set";
      sensitive: true;
    };

export interface ManagedConfigurationView {
  activeRevision: {
    id: string;
    version: number;
  };
  draftRevision: {
    baseVersion: number;
    id: string;
    updatedAt: string;
  };
  fields: ManagedConfigFieldView[];
  pendingRestartConsumers: ConfigConsumer[];
}

export interface ConfigurationAuditContext {
  ipHash?: string | null;
  requestId?: string | null;
}
