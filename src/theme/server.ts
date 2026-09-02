import { cookies } from "next/headers";

import {
  appAccentThemeCookieName,
  appThemeModeCookieName,
  defaultAppAccentTheme,
  defaultAppThemeMode,
  defaultResolvedAppThemeMode,
  resolveAppAccentTheme,
  resolveAppThemeMode,
  resolveStoredAppThemeMode,
  resolvedAppThemeCookieName,
} from "./app-theme";

export async function getRequestAppTheme() {
  try {
    const cookieStore = await cookies();

    return {
      mode: resolveAppThemeMode(cookieStore.get(appThemeModeCookieName)?.value),
      resolvedMode: resolveStoredAppThemeMode(
        cookieStore.get(resolvedAppThemeCookieName)?.value,
      ),
      accent: resolveAppAccentTheme(
        cookieStore.get(appAccentThemeCookieName)?.value,
      ),
    };
  } catch {
    return {
      mode: defaultAppThemeMode,
      resolvedMode: defaultResolvedAppThemeMode,
      accent: defaultAppAccentTheme,
    };
  }
}
