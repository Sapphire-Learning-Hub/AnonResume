"use client";

import { ApiOutlined, RobotOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import { type ReactNode, useId } from "react";

import { useAiProviderCatalogStyles } from "./AiProviderCatalog.style";

export function AiProviderList({ children }: { children: ReactNode }) {
  const { styles } = useAiProviderCatalogStyles();
  return <div className={styles.providerList}>{children}</div>;
}

export function AiProviderCard({
  actions,
  children,
  detail,
  disabledLabel,
  enabled,
  enabledLabel,
  endpoint,
  name,
}: {
  actions: ReactNode;
  children: ReactNode;
  detail?: ReactNode;
  disabledLabel: string;
  enabled: boolean;
  enabledLabel: string;
  endpoint: string;
  name: string;
}) {
  const { styles } = useAiProviderCatalogStyles();
  const headingId = useId();

  return (
    <article aria-labelledby={headingId} className={styles.providerCard}>
      <div className={styles.providerHeader}>
        <div className={styles.providerIdentity}>
          <span aria-hidden="true" className={styles.providerIcon}>
            <ApiOutlined />
          </span>
          <div>
            <div className={styles.providerTitleRow}>
              <h3 id={headingId}>{name}</h3>
              <Tag color={enabled ? "success" : "default"}>
                {enabled ? enabledLabel : disabledLabel}
              </Tag>
            </div>
            <p>{endpoint}</p>
            {detail ? <span>{detail}</span> : null}
          </div>
        </div>
        <div className={styles.providerActions}>{actions}</div>
      </div>
      {children}
    </article>
  );
}

export function AiModelEmpty({ children }: { children: ReactNode }) {
  const { styles } = useAiProviderCatalogStyles();
  return (
    <div className={styles.modelEmpty}>
      <RobotOutlined />
      <span>{children}</span>
    </div>
  );
}

export function AiModelTable({
  actionsLabel,
  children,
  detailsLabel,
  modelLabel,
  statusLabel,
}: {
  actionsLabel: string;
  children: ReactNode;
  detailsLabel: string;
  modelLabel: string;
  statusLabel: string;
}) {
  const { styles } = useAiProviderCatalogStyles();
  return (
    <div className={styles.modelTable}>
      <div aria-hidden="true" className={styles.modelTableHeader}>
        <span>{modelLabel}</span>
        <span>{detailsLabel}</span>
        <span>{statusLabel}</span>
        <span>{actionsLabel}</span>
      </div>
      {children}
    </div>
  );
}

export function AiModelRow({
  actions,
  details,
  modelKey,
  name,
  status,
}: {
  actions: ReactNode;
  details: ReactNode;
  modelKey: ReactNode;
  name: string;
  status: ReactNode;
}) {
  const { styles } = useAiProviderCatalogStyles();
  return (
    <div className={styles.modelRow}>
      <div className={styles.modelIdentity}>
        <h4>{name}</h4>
        <span>{modelKey}</span>
      </div>
      <div className={styles.modelDetails}>{details}</div>
      <div>{status}</div>
      <div className={styles.modelActions}>{actions}</div>
    </div>
  );
}
