import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: { error: vi.fn() } }),
}));

vi.mock("@/components/admin/AdminPagedSelect", () => ({
  AdminPagedSelect: ({ placeholder }: { placeholder: string }) => (
    <div>{placeholder}</div>
  ),
}));

import { AdminInviteUser } from "@/components/admin/AdminInviteUser";

describe("AdminInviteUser", () => {
  it("presents the management-role selector as required", () => {
    render(<AdminInviteUser />);

    fireEvent.click(screen.getByRole("button", { name: "邀请管理员" }));

    expect(screen.getByRole("dialog", { name: "邀请管理员" })).toBeInTheDocument();
    expect(screen.getByText("选择管理角色（必选）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送邀请" })).toBeDisabled();
  });
});
