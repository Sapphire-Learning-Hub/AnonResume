"use client";

import { App as AntdApp } from "antd";
import { createElement } from "react";
import { DiagnosticReference } from "@/components/system/DiagnosticReference";
import { getErrorDiagnostic } from "@/lib/observability/diagnostics/schema";

export function useAppFeedback() {
  const { message, notification } = AntdApp.useApp();

  return {
    notification,
    toast: message,
    failure(error: unknown, options: Parameters<typeof notification.error>[0]) {
      const id = getErrorDiagnostic(error);
      notification.error({ ...options, duration: false, description: createElement("div", null, options.description, id ? createElement(DiagnosticReference, { diagnosticId: id }) : null) });
    },
  };
}
