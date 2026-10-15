import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConfigProvider } from "antd";

import { FontMarket } from "@/components/fonts/FontMarket";
import { appTheme } from "@/styles/app-theme";

function renderMarket() {
  return render(
    <ConfigProvider theme={appTheme}>
      <FontMarket />
    </ConfigProvider>,
  );
}

function card(name: string) {
  return screen.getByRole("heading", { name }).closest("article")!;
}

function queryDialog(title: string) {
  return screen
    .queryAllByRole("dialog", { hidden: true })
    .find((dialog) => within(dialog).queryByText(title));
}

async function findDialog(title: string) {
  await waitFor(() => {
    expect(queryDialog(title)).toBeDefined();
  });

  return queryDialog(title)!;
}

describe("font comparison", () => {
  it("opens font details from a card", async () => {
    renderMarket();
    fireEvent.click(
      within(card("IBM Plex Sans")).getByRole("button", { name: "详情" }),
    );

    const dialog = await findDialog("IBM Plex Sans");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看字体来源" })).toHaveAttribute(
      "target",
      "_blank",
    );

  });

  it("requires two fonts and limits a comparison to four unique choices", async () => {
    renderMarket();
    fireEvent.click(
      within(card("IBM Plex Sans")).getByRole("button", { name: "加入对比" }),
    );

    const tray = screen.getByRole("complementary", { name: "字体对比选择" });
    expect(
      within(tray).getByRole("button", { name: "对比（1/4）" }),
    ).toBeDisabled();

    for (const name of ["Manrope", "Lato", "Source Sans 3"]) {
      fireEvent.click(
        within(card(name)).getByRole("button", { name: "加入对比" }),
      );
    }

    expect(
      within(card("Libre Franklin")).getByRole("button", { name: "加入对比" }),
    ).toBeDisabled();
    fireEvent.click(within(tray).getByRole("button", { name: "对比（4/4）" }));

    const dialog = await findDialog("字体对比");
    expect(
      within(dialog).getAllByRole("button", { name: "移出对比" }),
    ).toHaveLength(4);
  });
});
