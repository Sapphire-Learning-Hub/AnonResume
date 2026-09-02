import { theme as antdTheme, type ThemeConfig } from "antd";

import { UI_FONT_FAMILY } from "./ui-font";
import type {
  AppAccentTheme,
  ResolvedAppThemeMode,
} from "@/theme/app-theme";
import { getAppThemePalette } from "@/theme/app-palette";

export function getAppTheme(
  mode: ResolvedAppThemeMode,
  accent: AppAccentTheme,
): ThemeConfig {
  const dark = mode === "dark";
  const palette = getAppThemePalette(mode, accent);

  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    components: {
      Segmented: {
        borderRadius: 999,
        borderRadiusLG: 999,
        borderRadiusSM: 999,
        borderRadiusXS: 999,
      },
      Tooltip: {
        borderRadius: 8,
      },
    },
    cssVar: { key: `anonresume-${mode}-${accent}` },
    token: {
      colorPrimary: palette.accent,
      colorBgBase: palette.backgroundBase,
      colorBgLayout: palette.pageBackground,
      colorBgContainer: palette.surface,
      colorText: palette.text,
      colorTextSecondary: palette.textSecondary,
      colorBorder: palette.border,
      borderRadius: 16,
      fontFamily: UI_FONT_FAMILY,
    },
  };
}

export const appTheme = getAppTheme("light", "anon");
