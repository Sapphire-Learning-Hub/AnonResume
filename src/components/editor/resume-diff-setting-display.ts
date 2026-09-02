import { listResumeFontPresets } from "@/domain/resume/font-presets";
import type { useI18n } from "@/i18n/I18nProvider";

type Translator = ReturnType<typeof useI18n>["t"];

function formatFontFamily(value: string) {
  return (
    listResumeFontPresets().find((preset) => preset.fontFamily === value)?.name ??
    value
  );
}

function formatLocale(value: string, t: Translator) {
  if (value === "zh-CN") return t("common.languageOption.zh-CN");
  if (value === "en-US") return t("common.languageOption.en-US");

  return value;
}

function formatPageMargin(value: string, t: Translator) {
  const entries = Object.fromEntries(
    value.split(";").flatMap((entry) => {
      const separatorIndex = entry.indexOf(":");

      if (separatorIndex < 0) return [];

      return [
        [
          entry.slice(0, separatorIndex).trim(),
          entry.slice(separatorIndex + 1).trim(),
        ],
      ];
    }),
  );

  if (!entries.top || !entries.right || !entries.bottom || !entries.left) {
    return value;
  }

  return t("editor.diff.pageMarginValue", {
    top: entries.top,
    right: entries.right,
    bottom: entries.bottom,
    left: entries.left,
  });
}

export function formatResumeDiffSettingValue(
  field: string,
  value: string | undefined,
  t: Translator,
) {
  if (!value) return value;

  switch (field) {
    case "typography.fontFamily":
      return formatFontFamily(value);
    case "locale":
      return formatLocale(value, t);
    case "page.margin":
      return formatPageMargin(value, t);
    default:
      return value;
  }
}
