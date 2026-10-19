"use client";

import { useLayoutEffect } from "react";
import { RenderErrorDiagnostic } from "@/components/system/DiagnosticReference";

import { SystemStatePage } from "@/components/system/SystemStatePage";
import { useI18n } from "@/i18n/I18nProvider";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();

  useLayoutEffect(() => {
    document.title = t("system.error.documentTitle");
  }, [t]);

  return (
    <SystemStatePage
      actionLabel={t("system.error.retry")}
      code="500"
      description={t("system.error.description")}
      onAction={retry}
      title={t("system.error.title")}
    ><RenderErrorDiagnostic error={error} /></SystemStatePage>
  );
}
