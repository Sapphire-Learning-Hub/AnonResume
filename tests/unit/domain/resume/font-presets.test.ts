import {
  filterResumeFontPresets,
  getResumeFontPreset,
  isResumeFontFamilyAllowed,
  listResumeFontPresets,
  resolveResumeFontFamily,
} from "@/domain/resume/font-presets";

describe("resume font presets", () => {
  it("looks up a bundled preset by its stable identifier", () => {
    expect(getResumeFontPreset("noto-serif-sc")?.name).toBe("Noto Serif SC");
    expect(getResumeFontPreset("unknown-font")).toBeUndefined();
  });

  it("filters fonts by category while preserving catalog order", () => {
    expect(
      filterResumeFontPresets("", { category: "mono" }).map(
        (preset) => preset.id,
      ),
    ).toEqual(["noto-sans-mono"]);
    expect(filterResumeFontPresets("", { category: "all" })).toEqual(
      listResumeFontPresets(),
    );
  });

  it("searches names and localized font metadata case-insensitively", () => {
    expect(filterResumeFontPresets("HANDWRITING").map(({ id }) => id)).toContain(
      "lxgw-wenkai",
    );
    expect(
      filterResumeFontPresets("中文宋体", {
        getDescription: (preset) =>
          preset.id === "noto-serif-sc" ? "中文宋体" : "",
      }).map(({ id }) => id),
    ).toContain("noto-serif-sc");
  });

  it("never passes an unknown font value through to CSS", () => {
    const defaultPreset = getResumeFontPreset("ibm-plex-sans")!;
    const injected =
      'serif;background-image:url("https://attacker.example/pixel")';

    expect(isResumeFontFamilyAllowed(defaultPreset.fontFamily)).toBe(true);
    expect(isResumeFontFamilyAllowed(injected)).toBe(false);
    expect(resolveResumeFontFamily(injected)).toBe(
      defaultPreset.resolvedFontFamily,
    );
  });
});
