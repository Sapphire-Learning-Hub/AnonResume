import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { listResumeFontPresets } from "@/domain/resume/font-presets";

describe("font asset boundaries", () => {
  it("keeps Fontsource imports out of the root layout", async () => {
    const source = await readFile("src/app/layout.tsx", "utf8");
    expect(source).not.toContain("@fontsource");
  });

  it("maps every catalog asset key in the explicit loader registry", async () => {
    const source = await readFile(
      "src/components/resume/fonts/font-assets.tsx",
      "utf8",
    );
    const keys = new Set(listResumeFontPresets().map((preset) => preset.assetKey));
    keys.forEach((key) => expect(source).toContain(`\"${key}\"`));
  });
});
