"use client";

import { Button, Empty, Modal, Space, Tag } from "antd";
import { createStyles } from "antd-style";

import type { ManagedConfigurationRevisionView } from "./types";

const useStyles = createStyles(({ css, token }) => ({
  historyItem: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 14px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    &:first-child {
      padding-top: 4px;
    }

    &:last-child {
      padding-bottom: 4px;
      border-bottom: 0;
    }

    @media (max-width: ${token.screenSM}px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  `,
  historyItemContent: css`
    min-width: 0;
  `,
  historyList: css`
    display: grid;
  `,
  historyAction: css`
    && {
      justify-self: end;
      padding-inline: 0;
    }

    @media (max-width: ${token.screenSM}px) {
      && {
        justify-self: start;
      }
    }
  `,
}));

export function ConfigurationHistory({
  items,
  loading,
  fieldLabel,
  canRollback,
  onClose,
  onCloseDetails,
  onPrepareRollback,
  onSelect,
  open,
  selected,
  text,
}: {
  items: ManagedConfigurationRevisionView[];
  loading: boolean;
  fieldLabel: (field: string) => string;
  canRollback: boolean;
  onClose: () => void;
  onCloseDetails: () => void;
  onPrepareRollback: (revision: ManagedConfigurationRevisionView) => void;
  onSelect: (revision: ManagedConfigurationRevisionView) => void;
  open: boolean;
  selected?: ManagedConfigurationRevisionView;
  text: {
    active: string;
    author: string;
    close: string;
    configuredSecret: string;
    details: string;
    empty: string;
    history: string;
    prepareRollback: string;
    publishedAt: string;
    revisionDetails: (version: number) => string;
    version: (version: number) => string;
  };
}) {
  const { styles } = useStyles();

  return (
    <>
      <Modal
        footer={null}
        loading={loading}
        open={open}
        title={text.history}
        width={760}
        onCancel={onClose}
      >
        {items.length === 0 ? <Empty description={text.empty} /> : (
          <div className={styles.historyList}>
            {items.map((item) => (
              <article className={styles.historyItem} key={item.id}>
                <div className={styles.historyItemContent}>
                  <Space size={6} wrap>
                    <strong>{text.version(item.version)}</strong>
                    {item.status === "active" ? <Tag color="green">{text.active}</Tag> : null}
                  </Space>
                  <p className="admin-dialog-description">
                    {[
                      `${text.author}: ${item.createdByUserId}`,
                      item.publishedAt
                        ? `${text.publishedAt}: ${new Date(item.publishedAt).toLocaleString()}`
                        : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  className={styles.historyAction}
                  onClick={() => onSelect(item)}
                  type="link"
                >
                  {text.details}
                </Button>
              </article>
            ))}
          </div>
        )}
      </Modal>
      {selected ? (
        <Modal
          cancelText={text.close}
          footer={(_, { CancelBtn }) => (
            <Space>
              <CancelBtn />
              {canRollback ? (
                <Button danger onClick={() => onPrepareRollback(selected)}>
                  {text.prepareRollback}
                </Button>
              ) : null}
            </Space>
          )}
          open
          title={text.revisionDetails(selected.version)}
          width={720}
          onCancel={onCloseDetails}
        >
          {selected.changes.length === 0 ? <Empty description={text.empty} /> : (
            <div className="admin-stack">
              {selected.changes.map((change, index) => (
                <div key={`${change.field}-${index}`}>
                  <strong>{fieldLabel(change.field)}</strong>
                  <p className="admin-dialog-description">
                    {change.sensitive
                      ? `${text.configuredSecret}: ${change.operation}`
                      : `${String(change.before)} → ${String(change.after)}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
