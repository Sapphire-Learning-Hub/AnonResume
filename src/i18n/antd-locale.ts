import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";

import type { AppLocale } from "./messages";

export function getAntdLocale(locale: AppLocale) {
  return locale === "en-US" ? enUS : zhCN;
}
