import type { ConfigApplyMode, ConfigConsumer, ConfigGroup } from "@/lib/config/types";
import type { ConfigKey } from "@/lib/config/registry";

export interface ManagedConfigFieldView {
  applyMode: ConfigApplyMode;
  configured: boolean;
  consumers: readonly ConfigConsumer[];
  group: ConfigGroup;
  key: ConfigKey;
  public: boolean;
  sensitive: boolean;
  value?: boolean | number | string | string[];
}

export interface ManagedConfigurationRevisionView {
  createdAt: string;
  id: string;
  publishedAt: string | null;
  status: "active" | "draft" | "superseded";
  summary: string | null;
  updatedAt: string;
  version: number;
}

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
