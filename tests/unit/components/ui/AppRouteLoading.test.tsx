import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import {
  AppRouteLoadingBoundary,
  AppRouteLoadingHold,
  AppRouteLoadingProvider,
} from "@/components/ui/AppRouteLoading";

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

function LinkHarness() {
  return (
    <AppRouteLoadingProvider>
      <a href="/docs/editor" onClick={(event) => event.preventDefault()}>
        Open editor guide
      </a>
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

  it("starts before an internal site link handles client-side navigation", () => {
    render(<LinkHarness />);

    fireEvent.click(screen.getByRole("link", { name: "Open editor guide" }));

    expect(screen.getByRole("status", { name: "正在加载页面" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
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
