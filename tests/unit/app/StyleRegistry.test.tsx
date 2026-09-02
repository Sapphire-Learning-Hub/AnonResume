import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import StyleRegistry from "@/app/StyleRegistry";

vi.mock("next/navigation", () => ({
  useServerInsertedHTML: vi.fn(),
}));

vi.mock("antd-style", () => ({
  extractStaticStyle: Object.assign(() => [], { cache: {} }),
  StyleProvider: ({
    children,
    hashPriority,
  }: {
    children: ReactNode;
    hashPriority?: string;
  }) => (
    <div data-hash-priority={hashPriority} data-testid="style-provider">
      {children}
    </div>
  ),
}));

vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({ locale: "zh-CN" }),
}));

describe("StyleRegistry", () => {
  it("keeps Ant Design selectors at low priority so scoped styles are stable during hydration", () => {
    render(
      <StyleRegistry>
        <span>content</span>
      </StyleRegistry>,
    );

    expect(screen.getByTestId("style-provider")).toHaveAttribute(
      "data-hash-priority",
      "low",
    );
  });
});
