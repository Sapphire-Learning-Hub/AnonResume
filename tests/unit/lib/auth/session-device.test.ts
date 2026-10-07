import { describe, expect, it } from "vitest";

import { parseAccountSessionDevice } from "@/lib/auth/account/session-device";

describe("parseAccountSessionDevice", () => {
  it("does not present Chromium's frozen macOS user-agent version as the real system version", () => {
    expect(parseAccountSessionDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 " +
        "Safari/537.36 Edg/154.0.0.0",
    )).toEqual({
      type: "desktop",
      vendor: "Apple",
      model: "Macintosh",
      os: {
        name: "macOS",
        version: null,
        versionIsMinimum: false,
      },
    });
  });

  it("maps Darwin platform versions to their public macOS versions", () => {
    expect(parseAccountSessionDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      {
        platform: "macOS",
        platformVersion: "24.6.0",
        model: null,
      },
    ).os).toEqual({
      name: "macOS",
      version: "15.6.0",
      versionIsMinimum: false,
    });
  });

  it("keeps public macOS platform versions unchanged", () => {
    expect(parseAccountSessionDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      {
        platform: "macOS",
        platformVersion: "26.0.1",
        model: null,
      },
    ).os?.version).toBe("26.0.1");
  });
});
