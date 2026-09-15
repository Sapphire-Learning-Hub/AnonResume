import { fireEvent, render, screen } from "@testing-library/react";

import { CanvasPageNavigation } from "@/components/editor/CanvasPageNavigation";

describe("CanvasPageNavigation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("jumps to the requested page", () => {
    const onChange = vi.fn();
    render(
      <CanvasPageNavigation current={1} pageCount={3} onChange={onChange} />,
    );
    const input = screen.getByRole("textbox", { name: "跳至" });

    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "跳转" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });
});
