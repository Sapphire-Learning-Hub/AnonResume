import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { AppThemeProvider, useAppTheme } from "@/theme/AppThemeProvider";

function ThemeProbe() {
  const { mode, resolvedMode, accent, setMode, setAccent } = useAppTheme();

  return (
    <div>
      <output>{`${mode}:${resolvedMode}:${accent}`}</output>
      <button type="button" onClick={() => setMode("dark")}>dark</button>
      <button type="button" onClick={() => setMode("system")}>system</button>
      <button type="button" onClick={() => setAccent("classic")}>classic</button>
    </div>
  );
}

describe("AppThemeProvider", () => {
  let systemDark = false;
  let systemListener: (() => void) | undefined;

  beforeEach(() => {
    systemDark = false;
    systemListener = undefined;
    document.documentElement.removeAttribute("style");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        get matches() {
          return systemDark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => {
          systemListener = listener;
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("updates document theme attributes and persists explicit choices", () => {
    render(
      <AppThemeProvider
        initialAccent="anon"
        initialMode="light"
        initialResolvedMode="light"
      >
        <ThemeProbe />
      </AppThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    fireEvent.click(screen.getByRole("button", { name: "classic" }));

    expect(screen.getByText("dark:dark:classic")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-app-theme", "dark");
    expect(document.documentElement).toHaveAttribute(
      "data-app-accent",
      "classic",
    );
    expect(document.cookie).toContain("anonresume-theme-mode=dark");
    expect(document.cookie).toContain("anonresume-resolved-theme=dark");
    expect(document.cookie).toContain("anonresume-accent-theme=classic");
    expect(document.documentElement).toHaveStyle({
      "--app-page-background": "#141a24",
      "--app-page-background-raised": "#18202c",
      "--app-text": "#eef4ff",
      "--app-border": "#354156",
    });
  });

  it("tracks operating system changes while system mode is active", async () => {
    render(
      <AppThemeProvider
        initialAccent="anon"
        initialMode="system"
        initialResolvedMode="light"
      >
        <ThemeProbe />
      </AppThemeProvider>,
    );

    systemDark = true;
    systemListener?.();

    await waitFor(() => {
      expect(screen.getByText("system:dark:anon")).toBeInTheDocument();
    });
  });
});
