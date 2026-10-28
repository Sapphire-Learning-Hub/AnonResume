"use client";
import { Typography } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { ImageLibrary } from "./ImageLibrary";
export function ImageLibraryPage() {
  const { t } = useI18n();
  return (
    <>
      <Typography.Title level={2}>{t("images.title")}</Typography.Title>
      <ImageLibrary />
    </>
  );
}
