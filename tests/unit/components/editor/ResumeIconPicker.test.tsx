import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";

import { ResumeIconPicker } from "@/components/editor/ResumeIconPicker";
import { appTheme } from "@/styles/app-theme";

function renderPicker(onSelect = vi.fn()) {
  return {
    onSelect,
    ...render(
      <ConfigProvider theme={appTheme}>
        <ResumeIconPicker open onCancel={vi.fn()} onSelect={onSelect} />
      </ConfigProvider>,
    ),
  };
}

describe("ResumeIconPicker", () => {
  it("searches the local catalog and inserts the chosen icon", async () => {
    const { onSelect } = renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "图标库" });

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索图标" }), {
      target: { value: "邮箱" },
    });

    const insertButton = await within(dialog).findByRole("button", {
      name: "插入 邮箱",
    });

    expect(within(dialog).queryByRole("button", { name: "插入 电话" })).not.toBeInTheDocument();
    fireEvent.click(insertButton);

    expect(onSelect).toHaveBeenCalledWith("lucide:mail");
  });

  it("filters icons by category and exposes an empty result", async () => {
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "图标库" });

    fireEvent.click(within(dialog).getByText("联系方式"));

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "插入 邮箱" }),
      ).toBeInTheDocument();
    });
    expect(
      within(dialog).queryByRole("button", { name: "插入 GitHub" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索图标" }), {
      target: { value: "not-a-real-resume-icon" },
    });

    expect(await within(dialog).findByText("没有匹配的图标")).toBeInTheDocument();
  });
});
