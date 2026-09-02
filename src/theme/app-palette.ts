import type { CSSProperties } from "react";

import type { AppAccentTheme, ResolvedAppThemeMode } from "./app-theme";

interface AppThemePalette {
  accent: string;
  accentSoft: string;
  backgroundBase: string;
  pageBackground: string;
  pageBackgroundRaised: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  shadow: string;
}

const appThemePalettes: Record<
  AppAccentTheme,
  Record<ResolvedAppThemeMode, AppThemePalette>
> = {
  anon: {
    light: {
      accent: "#cf3f70",
      accentSoft: "rgba(207, 63, 112, 0.14)",
      backgroundBase: "#ffffff",
      pageBackground: "#f8f4f6",
      pageBackgroundRaised: "#fffafb",
      surface: "#ffffff",
      text: "#251c21",
      textSecondary: "#65545d",
      border: "#eadfe4",
      shadow: "rgba(74, 42, 57, 0.1)",
    },
    dark: {
      accent: "#cf3f70",
      accentSoft: "rgba(207, 63, 112, 0.2)",
      backgroundBase: "#121013",
      pageBackground: "#171418",
      pageBackgroundRaised: "#1d191e",
      surface: "#211d22",
      text: "#f6f0f3",
      textSecondary: "#c8bbc2",
      border: "#40363c",
      shadow: "rgba(0, 0, 0, 0.34)",
    },
  },
  classic: {
    light: {
      accent: "#0f62fe",
      accentSoft: "rgba(15, 98, 254, 0.14)",
      backgroundBase: "#ffffff",
      pageBackground: "#f4f7fb",
      pageBackgroundRaised: "#f8fbff",
      surface: "#ffffff",
      text: "#172033",
      textSecondary: "#52616b",
      border: "#dfe5ee",
      shadow: "rgba(15, 23, 42, 0.1)",
    },
    dark: {
      accent: "#0f62fe",
      accentSoft: "rgba(15, 98, 254, 0.24)",
      backgroundBase: "#0f141c",
      pageBackground: "#141a24",
      pageBackgroundRaised: "#18202c",
      surface: "#1c2430",
      text: "#eef4ff",
      textSecondary: "#aebbd0",
      border: "#354156",
      shadow: "rgba(0, 0, 0, 0.34)",
    },
  },
};

export interface AppThemeCssVariables extends CSSProperties {
  "--app-accent": string;
  "--app-accent-soft": string;
  "--app-page-background": string;
  "--app-page-background-raised": string;
  "--app-surface": string;
  "--app-text": string;
  "--app-text-secondary": string;
  "--app-border": string;
  "--app-shadow": string;
}

export function getAppThemePalette(
  mode: ResolvedAppThemeMode,
  accent: AppAccentTheme,
) {
  return appThemePalettes[accent][mode];
}

export function getAppThemeCssVariables(
  mode: ResolvedAppThemeMode,
  accent: AppAccentTheme,
): AppThemeCssVariables {
  const palette = getAppThemePalette(mode, accent);

  return {
    colorScheme: mode,
    "--app-accent": palette.accent,
    "--app-accent-soft": palette.accentSoft,
    "--app-page-background": palette.pageBackground,
    "--app-page-background-raised": palette.pageBackgroundRaised,
    "--app-surface": palette.surface,
    "--app-text": palette.text,
    "--app-text-secondary": palette.textSecondary,
    "--app-border": palette.border,
    "--app-shadow": palette.shadow,
  };
}
