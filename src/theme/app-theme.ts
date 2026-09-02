export const appThemeModes = ["system", "light", "dark"] as const;
export const appAccentThemes = ["anon", "classic"] as const;

export type AppThemeMode = (typeof appThemeModes)[number];
export type ResolvedAppThemeMode = Exclude<AppThemeMode, "system">;
export type AppAccentTheme = (typeof appAccentThemes)[number];

export const defaultAppThemeMode: AppThemeMode = "system";
export const defaultResolvedAppThemeMode: ResolvedAppThemeMode = "light";
export const defaultAppAccentTheme: AppAccentTheme = "anon";

export const appThemeModeCookieName = "anonresume-theme-mode";
export const resolvedAppThemeCookieName = "anonresume-resolved-theme";
export const appAccentThemeCookieName = "anonresume-accent-theme";

export function resolveAppThemeMode(value: unknown): AppThemeMode {
  return appThemeModes.includes(value as AppThemeMode)
    ? (value as AppThemeMode)
    : defaultAppThemeMode;
}

export function resolveStoredAppThemeMode(
  value: unknown,
): ResolvedAppThemeMode {
  return value === "dark" ? "dark" : defaultResolvedAppThemeMode;
}

export function resolveAppAccentTheme(value: unknown): AppAccentTheme {
  return appAccentThemes.includes(value as AppAccentTheme)
    ? (value as AppAccentTheme)
    : defaultAppAccentTheme;
}
