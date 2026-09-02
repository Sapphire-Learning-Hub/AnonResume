import { describe, expect, it } from "vitest";

import { getActiveResumePageIndex } from "@/components/editor/resume-page-navigation";

describe("resume page navigation", () => {
  it("selects the page nearest to the canvas viewport center", () => {
    expect(
      getActiveResumePageIndex({
        pages: [
          { index: 1, top: 80, height: 1120 },
          { index: 2, top: 1224, height: 1120 },
          { index: 3, top: 2368, height: 1120 },
        ],
        viewport: { top: 1000, height: 800 },
      }),
    ).toBe(2);
  });

  it("returns no active page when the canvas has no rendered pages", () => {
    expect(
      getActiveResumePageIndex({
        pages: [],
        viewport: { top: 0, height: 600 },
      }),
    ).toBeUndefined();
  });
});
