import { theme as antdTheme } from "antd";

import { appTheme, getAppTheme } from "@/styles/app-theme";

describe("appTheme", () => {
  it("uses the accessible Anon pink as the default application accent", () => {
    expect(appTheme.token?.colorPrimary).toBe("#cf3f70");
  });

  it("uses a synchronous system font stack for application chrome", () => {
    expect(appTheme.token?.fontFamily).toContain("-apple-system");
    expect(appTheme.token?.fontFamily).not.toContain("IBM Plex");
    expect(appTheme.token?.fontFamily).not.toContain("Noto Sans SC Variable");
  });

  it("keeps every Segmented track and item on the same pill radius", () => {
    expect(appTheme.components?.Segmented).toMatchObject({
      borderRadius: 999,
      borderRadiusLG: 999,
      borderRadiusSM: 999,
      borderRadiusXS: 999,
    });
  });

  it("uses a compact tooltip radius that connects cleanly with its arrow", () => {
    expect(appTheme.components?.Tooltip).toMatchObject({
      borderRadius: 8,
    });
  });

  it("builds dark and classic theme variants from the same token contract", () => {
    const darkTheme = getAppTheme("dark", "anon");
    const classicTheme = getAppTheme("light", "classic");
    const classicDarkTheme = getAppTheme("dark", "classic");

    expect(darkTheme.algorithm).toBe(antdTheme.darkAlgorithm);
    expect(darkTheme.cssVar).toEqual({ key: "anonresume-dark-anon" });
    expect(darkTheme.token?.colorBgLayout).toBe("#171418");
    expect(darkTheme.token?.colorPrimary).toBe("#cf3f70");
    expect(classicTheme.token?.colorPrimary).toBe("#0f62fe");
    expect(classicTheme.token?.colorBgLayout).toBe("#f4f7fb");
    expect(classicTheme.token?.colorText).toBe("#172033");
    expect(classicDarkTheme.token?.colorBgLayout).toBe("#141a24");
    expect(classicDarkTheme.token?.colorText).toBe("#eef4ff");
  });
});
