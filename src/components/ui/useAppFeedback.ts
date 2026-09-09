"use client";

import { App as AntdApp } from "antd";

export function useAppFeedback() {
  const { message, notification } = AntdApp.useApp();

  return {
    notification,
    toast: message,
  };
}
