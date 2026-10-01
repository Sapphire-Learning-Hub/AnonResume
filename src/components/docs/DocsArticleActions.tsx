"use client";

import { CopyOutlined, LinkOutlined } from "@ant-design/icons";
import { Button, Space } from "antd";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";

export function DocsArticleActions() {
  const { t } = useI18n();
  const { toast } = useAppFeedback();

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error({
        content: t("docs.actions.copyFailed"),
        key: "docs-copy-failed",
      });
    }
  }

  function copyArticle() {
    const article = document.querySelector<HTMLElement>(
      "[data-docs-article-body]",
    );
    const content = article?.innerText.trim();
    if (!content) return;
    void copyText(content, t("docs.actions.articleCopied"));
  }

  function copyPageUrl() {
    void copyText(window.location.href, t("docs.actions.linkCopied"));
  }

  return (
    <Space.Compact aria-label={t("docs.actions.label")} role="group">
      <Button
        aria-label={t("docs.actions.copyArticle")}
        icon={<CopyOutlined />}
        onClick={copyArticle}
      >
        {t("docs.actions.copyArticle")}
      </Button>
      <Button
        aria-label={t("docs.actions.copyLink")}
        icon={<LinkOutlined />}
        onClick={copyPageUrl}
      />
    </Space.Compact>
  );
}
