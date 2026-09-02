import { describe, expect, it } from "vitest";

import { getAntdLocale } from "@/i18n/antd-locale";

describe("Ant Design locale mapping", () => {
  it("maps the default Chinese interface to Chinese component copy", () => {
    expect(getAntdLocale("zh-CN").Pagination?.next_page).toBe("下一页");
  });

  it("maps the English interface to English component copy", () => {
    expect(getAntdLocale("en-US").Pagination?.next_page).toBe("Next Page");
  });
});
