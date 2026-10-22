"use client";
import { Button } from "antd";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { TemplateRequestError } from "@/lib/resume/templates/client";

const errors: Record<string, MessageKey> = {
  template_version_conflict: "personalTemplates.conflict",
  template_source_conflict: "personalTemplates.conflict",
  template_operation_conflict: "personalTemplates.conflict",
  template_document_unavailable: "personalTemplates.unavailable",
  template_not_found: "personalTemplates.notFound",
  template_account_unavailable: "personalTemplates.accountUnavailable",
  unauthorized: "personalTemplates.signIn",
};
export function templateErrorKey(error: unknown): MessageKey {
  return error instanceof TemplateRequestError
    ? (errors[error.code] ?? "personalTemplates.error")
    : "personalTemplates.error";
}
export function useTemplateFeedback() {
  const { t } = useI18n();
  const { toast, notification } = useAppFeedback();
  function report(error: unknown) {
    if (
      error instanceof TemplateRequestError &&
      error.code === "unauthorized"
    ) {
      notification.error({
        title: t("personalTemplates.signIn"),
        key: "personal-template-auth",
        duration: false,
        actions: (
          <Button href="/sign-in">{t("personalTemplates.signInAction")}</Button>
        ),
      });
    } else
      toast.error({
        content: t(templateErrorKey(error)),
        key: "personal-template-operation",
      });
  }
  return { report, toast };
}
