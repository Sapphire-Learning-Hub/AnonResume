import { render, screen } from "@testing-library/react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";

describe("AnonResumeLogo", () => {
  it.each([
    ["mark", "/brand/anonresume-mark.png"],
    ["wordmark", "/brand/anonresume-wordmark.png"],
    ["lockup", "/brand/anonresume-lockup.png"],
  ] as const)("renders the %s asset independently", (variant, source) => {
    render(<AnonResumeLogo variant={variant} />);

    expect(screen.getByRole("img", { name: "AnonResume" })).toHaveAttribute(
      "src",
      source,
    );
  });

  it("can be hidden from assistive technology when paired with live text", () => {
    const { container } = render(
      <AnonResumeLogo alt="" variant="mark" />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
