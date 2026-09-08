import { render, screen } from "@testing-library/react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";

describe("AdminOtpInput", () => {
  it("renders a full-width six-cell verification control", () => {
    render(<AdminOtpInput onChange={() => undefined} value="" />);

    expect(screen.getByRole("group")).toHaveClass("admin-otp");
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getAllByRole("textbox")[0]).toHaveClass("admin-otp__input");
  });
});
