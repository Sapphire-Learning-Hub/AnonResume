import {
  filterAndSortResumeFontPresets,
  parseFontMarketQuery,
  serializeFontMarketQuery,
  usesFallbackForText,
} from "@/domain/resume/fonts/market";
import {
  getResumeFontPreset,
  listResumeFontPresets,
} from "@/domain/resume/font-presets";

describe("font market rules", () => {
  it("intersects dimensions while unioning values inside one dimension", () => {
    const result = filterAndSortResumeFontPresets({
      presets: listResumeFontPresets(),
      filters: {
        categories: ["serif", "handwriting"],
        scripts: ["zh-CN"],
        useCases: ["body"],
        sort: "newest",
      },
    });

    expect(result.map(({ id }) => id)).toEqual([
      "lxgw-wenkai",
      "noto-serif-sc",
    ]);
  });

  it("sorts by recent use, newest addition, and name without recommendation fallback", () => {
    const presets = [
      getResumeFontPreset("ibm-plex-sans")!,
      getResumeFontPreset("ma-shan-zheng")!,
      getResumeFontPreset("bitter")!,
    ];

    expect(
      filterAndSortResumeFontPresets({
        presets,
        filters: { categories: [], scripts: [], useCases: [], sort: "recent" },
        recentUsage: {
          "ibm-plex-sans": 100,
          bitter: 300,
          "ma-shan-zheng": 200,
        },
      }).map(({ id }) => id),
    ).toEqual(["bitter", "ma-shan-zheng", "ibm-plex-sans"]);
    expect(
      filterAndSortResumeFontPresets({
        presets,
        filters: { categories: [], scripts: [], useCases: [], sort: "recent" },
        recentUsage: {},
      }).map(({ id }) => id),
    ).toEqual(["bitter", "ibm-plex-sans", "ma-shan-zheng"]);
    expect(
      filterAndSortResumeFontPresets({
        presets,
        filters: { categories: [], scripts: [], useCases: [], sort: "newest" },
      }).map(({ id }) => id),
    ).toEqual(["bitter", "ma-shan-zheng", "ibm-plex-sans"]);
    expect(
      filterAndSortResumeFontPresets({
        presets,
        filters: { categories: [], scripts: [], useCases: [], sort: "name" },
      }).map(({ id }) => id),
    ).toEqual(["Bitter", "IBM Plex Sans", "Ma Shan Zheng"].map((name) =>
      presets.find((preset) => preset.name === name)!.id,
    ));
  });

  it("ignores unknown URL values and serializes only active filters", () => {
    const parsed = parseFontMarketQuery(
      new URLSearchParams(
        "q=serif&category=serif&category=invalid&script=zh-CN&use=body&sort=unknown",
      ),
    );

    expect(parsed).toEqual({
      query: "serif",
      categories: ["serif"],
      scripts: ["zh-CN"],
      useCases: ["body"],
      sort: "newest",
    });
    expect(serializeFontMarketQuery(parsed).toString()).toBe(
      "q=serif&category=serif&script=zh-CN&use=body",
    );
  });

  it("reports when Chinese preview text uses a fallback font", () => {
    expect(
      usesFallbackForText(getResumeFontPreset("ibm-plex-sans")!, "中文 Resume"),
    ).toBe(true);
    expect(
      usesFallbackForText(getResumeFontPreset("noto-sans-sc")!, "中文 Resume"),
    ).toBe(false);
    expect(
      usesFallbackForText(getResumeFontPreset("ibm-plex-sans")!, "Resume 2026"),
    ).toBe(false);
  });
});
