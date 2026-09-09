import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";

import {
  AdminRecoveryCodesPanel,
  buildRecoveryCodesText,
  formatRecoveryCodesFileDate,
  formatRecoveryGeneratedAt,
} from "@/components/admin/AdminRecoveryCodesPanel";

const codes = [
  "AAAA-BBBB-CCCC-DDDD-EEEE",
  "1111-2222-3333-4444-5555",
];

afterEach(() => {
  delete document.documentElement.dataset.adminRecoveryPrinting;
  vi.useRealTimers();
});

describe("AdminRecoveryCodesPanel", () => {
  it("builds a local export containing the account and every recovery code", () => {
    const generatedAt = new Date("2026-09-08T23:30:00.000Z");
    const formattedGeneratedAt = formatRecoveryGeneratedAt({
      generatedAt,
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
    });
    const content = buildRecoveryCodesText({
      codes,
      email: "owner@example.com",
      generatedAt,
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
    });

    expect(content).toContain("owner@example.com");
    expect(content).toContain(`生成时间：${formattedGeneratedAt}`);
    expect(content).not.toContain(generatedAt.toISOString());
    expect(
      formatRecoveryCodesFileDate(generatedAt, "Asia/Shanghai"),
    ).toBe("2026-09-09");
    expect(content).toContain(codes[0]);
    expect(content).toContain(codes[1]);
    expect(content).toContain("请勿以明文发送给他人");
  });

  it("downloads the codes locally and opens the browser print dialog", () => {
    const objectUrl = vi.fn(() => "blob:recovery-codes");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    class TestUrl extends URL {}
    Object.assign(TestUrl, {
      createObjectURL: objectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    vi.stubGlobal("URL", TestUrl);

    render(
      <AdminRecoveryCodesPanel
        codes={codes}
        email="owner@example.com"
        onContinue={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载恢复码" }));
    expect(objectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:recovery-codes");

    fireEvent.click(screen.getByRole("button", { name: "打印恢复码" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.adminRecoveryPrinting).toBe(
      "true",
    );

    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.dataset.adminRecoveryPrinting).toBeUndefined();
  });

  it("renders the same browser-time-zone timestamp used by the export", () => {
    const generatedAt = new Date("2026-09-08T23:30:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(generatedAt);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expected = formatRecoveryGeneratedAt({
      generatedAt,
      locale: "zh-CN",
      timeZone,
    });

    render(
      <AdminRecoveryCodesPanel
        codes={codes}
        email="owner@example.com"
        onContinue={() => undefined}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(
      buildRecoveryCodesText({
        codes,
        email: "owner@example.com",
        generatedAt,
        locale: "zh-CN",
        timeZone,
      }),
    ).toContain(`生成时间：${expected}`);
  });
});
