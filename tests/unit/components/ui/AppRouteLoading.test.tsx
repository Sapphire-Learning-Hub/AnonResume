import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { useState } from "react";
import { vi } from "vitest";

import {
  AppRouteLink,
  AppRouteLoadingBoundary,
  AppRouteLoadingHold,
  AppRouteLoadingProvider,
} from "@/components/ui/AppRouteLoading";

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react");
  type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    onNavigate?: (event: { preventDefault: () => void }) => void;
  };

  return {
    default: forwardRef<HTMLAnchorElement, MockLinkProps>(function MockLink(
      { onClick, onNavigate, ...props },
      ref,
    ) {
      return (
        <a
          {...props}
          ref={ref}
          onClick={(event) => {
            onClick?.(event);
            if (event.defaultPrevented) return;

            event.preventDefault();
            onNavigate?.({ preventDefault: () => {} });
          }}
        />
      );
    }),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams(),
}));

function LoadingHarness() {
  const [loading, setLoading] = useState(true);

  return (
    <AppRouteLoadingProvider>
      <button type="button" onClick={() => setLoading(false)}>
        Complete navigation
      </button>
      {loading ? <AppRouteLoadingBoundary /> : null}
    </AppRouteLoadingProvider>
  );
}

function PreventedLinkHarness() {
  return (
    <AppRouteLoadingProvider>
      <a href="/docs/editor" onClick={(event) => event.preventDefault()}>
        Open editor guide
      </a>
    </AppRouteLoadingProvider>
  );
}

function AppRouteLinkHarness({ cancel = false }: { cancel?: boolean }) {
  return (
    <AppRouteLoadingProvider>
      <AppRouteLink
        href="/docs/editor"
        onNavigate={cancel ? (event) => event.preventDefault() : undefined}
      >
        Open editor guide
      </AppRouteLink>
    </AppRouteLoadingProvider>
  );
}

function ReadinessHarness({ ready }: { ready: boolean }) {
  return (
    <AppRouteLoadingProvider>
      <AppRouteLoadingHold active={!ready} />
    </AppRouteLoadingProvider>
  );
}

describe("AppRouteLoading", () => {
  it("exposes an indeterminate route progress state while a boundary is active", () => {
    render(<LoadingHarness />);

    expect(screen.getByRole("status", { name: "正在加载页面" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("progressbar", { name: "正在加载页面" }),
    ).not.toHaveAttribute("aria-valuenow");
  });

  it("keeps the indicator mounted for its fade-out after loading completes", async () => {
    const { container } = render(<LoadingHarness />);

    await act(async () => {
      screen.getByRole("button", { name: "Complete navigation" }).click();
    });

    expect(container.querySelector("[data-app-route-loading]"))
      .toHaveAttribute("aria-busy", "false");
  });

  it("does not start for a same-origin click that cancels navigation", () => {
    const { container } = render(<PreventedLinkHarness />);

    fireEvent.click(screen.getByRole("link", { name: "Open editor guide" }));

    expect(container.querySelector("[data-app-route-loading]"))
      .toHaveAttribute("aria-busy", "false");
  });

  it("starts when a Next link confirms client-side navigation", () => {
    render(<AppRouteLinkHarness />);

    fireEvent.click(screen.getByRole("link", { name: "Open editor guide" }));

    expect(screen.getByRole("status", { name: "正在加载页面" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("does not start when a Next link cancels client-side navigation", () => {
    const { container } = render(<AppRouteLinkHarness cancel />);

    fireEvent.click(screen.getByRole("link", { name: "Open editor guide" }));

    expect(container.querySelector("[data-app-route-loading]"))
      .toHaveAttribute("aria-busy", "false");
  });

  it("stays active until the destination surface reports that it is ready", () => {
    const { container, rerender } = render(<ReadinessHarness ready={false} />);

    expect(screen.getByRole("status", { name: "正在加载页面" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    rerender(<ReadinessHarness ready />);

    expect(container.querySelector("[data-app-route-loading]"))
      .toHaveAttribute("aria-busy", "false");
  });
});
