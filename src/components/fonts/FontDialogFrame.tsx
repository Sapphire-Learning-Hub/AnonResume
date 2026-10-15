"use client";

import { Modal } from "antd";
import type { ReactNode } from "react";

export function FontDialogFrame({
  children,
  open,
  title,
  width,
  onClose,
}: {
  children: ReactNode;
  open: boolean;
  title: string;
  width?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      footer={null}
      onCancel={onClose}
      open={open}
      title={title}
      width={width ?? "720px"}
    >
      {children}
    </Modal>
  );
}
