"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import {
  appAccentThemeCookieName,
  appThemeModeCookieName,
  defaultAppAccentTheme,
  defaultAppThemeMode,
  defaultResolvedAppThemeMode,
  resolvedAppThemeCookieName,
  type AppAccentTheme,
  type AppThemeMode,
  type ResolvedAppThemeMode,
} from "./app-theme";
import { getAppThemeCssVariables } from "./app-palette";

interface AppThemeContextValue {
  mode: AppThemeMode;
  resolvedMode: ResolvedAppThemeMode;
  accent: AppAccentTheme;
  setMode: (mode: AppThemeMode) => void;
  setAccent: (accent: AppAccentTheme) => void;
}

const AppThemeContext = createContext<AppThemeContextValue>({
  mode: defaultAppThemeMode,
  resolvedMode: defaultResolvedAppThemeMode,
  accent: defaultAppAccentTheme,
  setMode: () => {},
  setAccent: () => {},
});

function getSystemTheme(): ResolvedAppThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function writePreferenceCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function AppThemeProvider({
  initialMode,
  initialResolvedMode,
  initialAccent,
  children,
}: PropsWithChildren<{
  initialMode: AppThemeMode;
  initialResolvedMode: ResolvedAppThemeMode;
  initialAccent: AppAccentTheme;
}>) {
  const [mode, setModeState] = useState(initialMode);
  const [resolvedMode, setResolvedMode] = useState(initialResolvedMode);
  const [accent, setAccentState] = useState(initialAccent);

  useEffect(() => {
    document.documentElement.dataset.appTheme = resolvedMode;
    document.documentElement.dataset.appAccent = accent;
    const cssVariables = getAppThemeCssVariables(resolvedMode, accent);

    for (const [name, value] of Object.entries(cssVariables)) {
      if (name === "colorScheme") {
        document.documentElement.style.colorScheme = value;
      } else {
        document.documentElement.style.setProperty(name, value);
      }
    }

    writePreferenceCookie(resolvedAppThemeCookieName, resolvedMode);
  }, [accent, resolvedMode]);

  useEffect(() => {
    if (mode !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setResolvedMode(getSystemTheme());

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);

    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [mode]);

  function setMode(nextMode: AppThemeMode) {
    const nextResolvedMode =
      nextMode === "system" ? getSystemTheme() : nextMode;

    setModeState(nextMode);
    setResolvedMode(nextResolvedMode);
    writePreferenceCookie(appThemeModeCookieName, nextMode);
    writePreferenceCookie(resolvedAppThemeCookieName, nextResolvedMode);
  }

  function setAccent(nextAccent: AppAccentTheme) {
    setAccentState(nextAccent);
    writePreferenceCookie(appAccentThemeCookieName, nextAccent);
  }

  return (
    <AppThemeContext.Provider
      value={{ mode, resolvedMode, accent, setMode, setAccent }}
    >
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
