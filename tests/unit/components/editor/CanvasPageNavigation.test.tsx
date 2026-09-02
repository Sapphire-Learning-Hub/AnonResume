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

  it("keeps the Ant input colors intact and exposes an explicit jump action", () => {
    const onChange = vi.fn();
    const { container } = render(
      <CanvasPageNavigation current={1} pageCount={3} onChange={onChange} />,
    );
    const input = screen.getByRole("textbox", { name: "跳至" });
    const pagination = container.querySelector(".ant-pagination");

    expect(pagination).not.toHaveAttribute("style");
    expect(getComputedStyle(input).color).toBe("var(--ant-color-text)");

    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "跳转" }));

    expect(onChange).toHaveBeenCalledWith(3);
  });
});
