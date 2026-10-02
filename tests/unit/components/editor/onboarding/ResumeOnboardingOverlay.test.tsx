import { fireEvent, render, screen } from "@testing-library/react";

import { editorOnboardingSteps } from "@/domain/onboarding/editor-basics";
import { ResumeOnboardingOverlay } from "@/components/editor/onboarding/ResumeOnboardingOverlay";

describe("ResumeOnboardingOverlay", () => {
  it("renders outside document flow without changing or blocking the target", () => {
    const targetClick = vi.fn();
    const target = document.createElement("button");
    target.textContent = "Editable target";
    target.addEventListener("click", targetClick);
    document.body.append(target);
    const before = target.getBoundingClientRect();

    const { unmount } = render(
      <ResumeOnboardingOverlay
        actions={{
          onDismiss: vi.fn(),
          onNavigate: vi.fn(),
          onPause: vi.fn(),
          onRetry: vi.fn(),
          onSkip: vi.fn(),
        }}
        anchor={new DOMRect(40, 60, 240, 48)}
        state="active"
        step={editorOnboardingSteps[1]}
      />,
    );

    expect(screen.getByTestId("onboarding-highlight")).toHaveStyle({
      pointerEvents: "none",
      position: "fixed",
    });
    fireEvent.click(target);
    expect(targetClick).toHaveBeenCalledTimes(1);
    expect(target.getBoundingClientRect()).toEqual(before);

    unmount();
    target.remove();
  });

  it("keeps recovery actions available when the target is missing", () => {
    const onRetry = vi.fn();
    const onSkip = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ResumeOnboardingOverlay
        actions={{
          onDismiss,
          onNavigate: vi.fn(),
          onPause: vi.fn(),
          onRetry,
          onSkip,
        }}
        anchor={null}
        state="missing"
        step={editorOnboardingSteps[2]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "再试一次" }));
    fireEvent.click(screen.getByRole("button", { name: "跳过此步" }));
    fireEvent.click(screen.getByRole("button", { name: "退出练习" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
