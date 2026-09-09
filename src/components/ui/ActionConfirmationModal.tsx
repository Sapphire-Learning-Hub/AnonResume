"use client";

import { Modal } from "antd";
import type { ReactNode } from "react";

export function ActionConfirmationModal({
  cancelText,
  confirmText,
  danger = true,
  description,
  onCancel,
  onConfirm,
  open,
  pending = false,
  title,
}: {
  cancelText: string;
  confirmText: string;
  danger?: boolean;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  pending?: boolean;
  title: string;
}) {
  return (
    <Modal
      cancelText={cancelText}
      destroyOnHidden
      okButtonProps={{ danger, loading: pending }}
      okText={confirmText}
      onCancel={onCancel}
      onOk={onConfirm}
      open={open}
      title={title}
    >
      <p className="admin-dialog-description">{description}</p>
    </Modal>
  );
}
