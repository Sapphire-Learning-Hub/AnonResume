import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decision: vi.fn(),
  headers: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/setup/access", () => ({
  getSetupAccessDecision: mocks.decision,
}));
vi.mock("@/lib/runtime/configuration", () => ({
  resolveApplicationOriginForBootstrap: () => "http://localhost:3000",
  validateBootstrapConfiguration: () => ({ valid: true, issues: [] }),
}));
vi.mock("@/lib/config/runtime", () => ({ getRuntimeConfig: mocks.runtime }));
vi.mock("@/i18n/server", () => ({ getRequestLocale: () => "zh-CN" }));
vi.mock("@/theme/server", () => ({
  getRequestAppTheme: () => ({
    accent: "anon",
    mode: "light",
    resolvedMode: "light",
  }),
}));
vi.mock("@/components/admin/setup/AdminSetupWizard", () => ({
  AdminSetupWizard: ({ initialMode }: { initialMode: string }) => (
    <h1>setup:{initialMode}</h1>
  ),
}));
vi.mock("@/components/ui/GlobalFloatingActions", () => ({
  GlobalFloatingActions: () => <div>floating actions</div>,
}));
vi.mock("@/components/config/PublicRuntimeConfigProvider", () => ({
  DEFAULT_PUBLIC_RUNTIME_CONFIG: {
    aiEnabled: false,
    configurationHealth: "healthy",
    privacyPolicyUrl: "",
    sourceCodeUrl: "",
    supportUrl: "",
    termsOfServiceUrl: "",
  },
  PublicRuntimeConfigProvider: ({
    children,
    value,
  }: PropsWithChildren<{
    value: {
      aiEnabled: boolean;
      privacyPolicyUrl: string;
      supportUrl: string;
      termsOfServiceUrl: string;
    };
  }>) => (
    <div
      data-ai-enabled={value.aiEnabled}
      data-privacy-url={value.privacyPolicyUrl}
      data-support-url={value.supportUrl}
      data-terms-url={value.termsOfServiceUrl}
    >
      {children}
    </div>
  ),
}));
vi.mock("@/i18n/I18nProvider", () => ({
  I18nProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/theme/AppThemeProvider", () => ({
  AppThemeProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/app/StyleRegistry", () => ({
  default: ({ children }: PropsWithChildren) => children,
}));

import RootLayout from "@/app/layout";

describe("root layout setup gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({ "x-anonresume-pathname": "/app" }),
    );
    mocks.runtime.mockResolvedValue({
      health: "healthy",
      values: {
        aiEnabled: true,
        privacyPolicyUrl: "https://example.com/privacy",
        sourceCodeUrl: "https://example.com/source",
        supportUrl: "https://example.com/support",
        termsOfServiceUrl: "https://example.com/terms",
      },
    });
  });

  it("replaces product HTML with the setup experience", async () => {
    mocks.decision.mockResolvedValue("require_setup");

    render(
      await RootLayout({
        children: <h1>Product</h1>,
        params: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { name: "setup:initialization" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Product" })).not.toBeInTheDocument();
    expect(screen.queryByText("floating actions")).not.toBeInTheDocument();
    expect(mocks.decision).toHaveBeenCalledWith("/app");
  });

  it("does not let setup lookup break a configuration recovery path", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-anonresume-pathname": "/configuration-recovery" }),
    );
    mocks.runtime.mockRejectedValue(new Error("database unavailable"));

    render(
      await RootLayout({
        children: <h1>Configuration recovery</h1>,
        params: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Configuration recovery" }),
    ).toBeVisible();
    expect(mocks.decision).not.toHaveBeenCalled();
  });

  it("injects public help and legal configuration into the application shell", async () => {
    mocks.decision.mockResolvedValue("allow");

    render(
      await RootLayout({
        children: <h1>Product</h1>,
        params: Promise.resolve({}),
      }),
    );

    const shell = screen.getByRole("heading", { name: "Product" }).parentElement;
    expect(shell).toHaveAttribute("data-ai-enabled", "true");
    expect(shell).toHaveAttribute(
      "data-privacy-url",
      "https://example.com/privacy",
    );
    expect(shell).toHaveAttribute(
      "data-support-url",
      "https://example.com/support",
    );
    expect(shell).toHaveAttribute(
      "data-terms-url",
      "https://example.com/terms",
    );
  });
});
