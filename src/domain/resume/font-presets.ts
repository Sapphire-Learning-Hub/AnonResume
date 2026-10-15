export type ResumeFontCategory = "sans" | "serif" | "mono" | "handwriting";
export type ResumeFontScript = "latin" | "zh-CN";
export type ResumeFontUseCase =
  | "business"
  | "compact"
  | "body"
  | "editorial"
  | "display"
  | "technical"
  | "creative";
export type ResumeFontAssetKey =
  | "latin-sans"
  | "latin-serif"
  | "mono"
  | "cjk-sans"
  | "cjk-serif-display";

export type ResumeFontPreset = {
  id:
    | "ibm-plex-sans"
    | "manrope"
    | "lato"
    | "source-sans-3"
    | "libre-franklin"
    | "roboto-condensed"
    | "noto-sans-sc"
    | "zcool-qingke-huangyou"
    | "noto-sans-mono"
    | "jetbrains-mono"
    | "noto-serif-sc"
    | "zcool-xiaowei"
    | "source-serif-4"
    | "bitter"
    | "lora"
    | "merriweather"
    | "playfair-display"
    | "lxgw-marker-gothic"
    | "lxgw-wenkai"
    | "ma-shan-zheng";
  name: string;
  fontFamily: string;
  resolvedFontFamily: string;
  fontLoadFamily: string;
  descriptionKey:
    | "editor.fontPreset.businessSans"
    | "editor.fontPreset.modernSans"
    | "editor.fontPreset.geometricSans"
    | "editor.fontPreset.humanistSans"
    | "editor.fontPreset.neutralSans"
    | "editor.fontPreset.classicGrotesque"
    | "editor.fontPreset.condensedSans"
    | "editor.fontPreset.geometricChinese"
    | "editor.fontPreset.technicalMono"
    | "editor.fontPreset.developerMono"
    | "editor.fontPreset.chineseSerif"
    | "editor.fontPreset.chineseDisplay"
    | "editor.fontPreset.classicSerif"
    | "editor.fontPreset.slabSerif"
    | "editor.fontPreset.editorialSerif"
    | "editor.fontPreset.readableSerif"
    | "editor.fontPreset.displaySerif"
    | "editor.fontPreset.markerGothic"
    | "editor.fontPreset.chineseHandwriting"
    | "editor.fontPreset.brushCalligraphy";
  category: ResumeFontCategory;
  scripts: readonly ResumeFontScript[];
  useCases: readonly ResumeFontUseCase[];
  assetKey: ResumeFontAssetKey;
  recommended?: true;
  addedAt: string;
  license: "OFL-1.1";
  source: string;
};

const RESUME_FONT_PRESETS: readonly ResumeFontPreset[] = [
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    resolvedFontFamily:
      "var(--font-ibm-plex-sans), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"IBM Plex Sans Variable", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.businessSans",
    category: "sans",
    scripts: ["latin"],
    useCases: ["business", "body"],
    assetKey: "latin-sans",
    recommended: true,
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/IBM/plex",
  },
  {
    id: "manrope",
    name: "Manrope",
    fontFamily: '"Manrope", sans-serif',
    resolvedFontFamily:
      "var(--font-manrope), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily: '"Manrope Variable", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.geometricSans",
    category: "sans",
    scripts: ["latin"],
    useCases: ["business", "display"],
    assetKey: "latin-sans",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/sharanda/manrope",
  },
  {
    id: "lato",
    name: "Lato",
    fontFamily: '"Lato", sans-serif',
    resolvedFontFamily:
      "var(--font-lato), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily: '"Lato", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.humanistSans",
    category: "sans",
    scripts: ["latin"],
    useCases: ["business", "body"],
    assetKey: "latin-sans",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/LatoGFVersion",
  },
  {
    id: "source-sans-3",
    name: "Source Sans 3",
    fontFamily: '"Source Sans 3", sans-serif',
    resolvedFontFamily:
      "var(--font-source-sans-3), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"Source Sans 3 Variable", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.neutralSans",
    category: "sans",
    scripts: ["latin"],
    useCases: ["business", "body"],
    assetKey: "latin-sans",
    recommended: true,
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/adobe-fonts/source-sans",
  },
  {
    id: "libre-franklin",
    name: "Libre Franklin",
    fontFamily: '"Libre Franklin", sans-serif',
    resolvedFontFamily:
      "var(--font-libre-franklin), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"Libre Franklin Variable", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.classicGrotesque",
    category: "sans",
    scripts: ["latin"],
    useCases: ["business", "body"],
    assetKey: "latin-sans",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/Libre-Franklin",
  },
  {
    id: "roboto-condensed",
    name: "Roboto Condensed",
    fontFamily: '"Roboto Condensed", sans-serif',
    resolvedFontFamily:
      "var(--font-roboto-condensed), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"Roboto Condensed Variable", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.condensedSans",
    category: "sans",
    scripts: ["latin"],
    useCases: ["compact", "business"],
    assetKey: "latin-sans",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/roboto-classic",
  },
  {
    id: "noto-sans-sc",
    name: "Noto Sans SC",
    fontFamily: '"Source Han Sans SC", "Noto Sans SC", sans-serif',
    resolvedFontFamily: "var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily: '"Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.modernSans",
    category: "sans",
    scripts: ["latin", "zh-CN"],
    useCases: ["business", "body"],
    assetKey: "cjk-sans",
    recommended: true,
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/notofonts/noto-cjk",
  },
  {
    id: "zcool-qingke-huangyou",
    name: "ZCOOL QingKe HuangYou",
    fontFamily: '"ZCOOL QingKe HuangYou", "Noto Sans SC", sans-serif',
    resolvedFontFamily:
      "var(--font-zcool-qingke-huangyou), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"ZCOOL QingKe HuangYou", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.geometricChinese",
    category: "sans",
    scripts: ["latin", "zh-CN"],
    useCases: ["display", "creative"],
    assetKey: "cjk-sans",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/zcool-qingke-huangyou",
  },
  {
    id: "noto-sans-mono",
    name: "Noto Sans Mono",
    fontFamily: '"Noto Sans Mono", monospace',
    resolvedFontFamily:
      "var(--font-noto-sans-mono), var(--font-noto-sans-sc), monospace",
    fontLoadFamily:
      '"Noto Sans Mono Variable", "Noto Sans SC Variable", monospace',
    descriptionKey: "editor.fontPreset.technicalMono",
    category: "mono",
    scripts: ["latin"],
    useCases: ["technical", "compact"],
    assetKey: "mono",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/notofonts/latin-greek-cyrillic",
  },
  {
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    fontFamily: '"JetBrains Mono", monospace',
    resolvedFontFamily:
      "var(--font-jetbrains-mono), var(--font-noto-sans-sc), monospace",
    fontLoadFamily:
      '"JetBrains Mono Variable", "Noto Sans SC Variable", monospace',
    descriptionKey: "editor.fontPreset.developerMono",
    category: "mono",
    scripts: ["latin"],
    useCases: ["technical", "compact"],
    assetKey: "mono",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/JetBrains/JetBrainsMono",
  },
  {
    id: "noto-serif-sc",
    name: "Noto Serif SC",
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
    resolvedFontFamily:
      "var(--font-noto-serif-sc), var(--font-noto-sans-sc), serif",
    fontLoadFamily:
      '"Noto Serif SC Variable", "Noto Sans SC Variable", serif',
    descriptionKey: "editor.fontPreset.chineseSerif",
    category: "serif",
    scripts: ["latin", "zh-CN"],
    useCases: ["body", "editorial"],
    assetKey: "cjk-serif-display",
    recommended: true,
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/notofonts/noto-cjk",
  },
  {
    id: "zcool-xiaowei",
    name: "ZCOOL XiaoWei",
    fontFamily: '"ZCOOL XiaoWei", "Noto Serif SC", serif',
    resolvedFontFamily:
      "var(--font-zcool-xiaowei), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"ZCOOL XiaoWei", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.chineseDisplay",
    category: "serif",
    scripts: ["latin", "zh-CN"],
    useCases: ["display", "creative"],
    assetKey: "cjk-serif-display",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/xiaowei",
  },
  {
    id: "source-serif-4",
    name: "Source Serif 4",
    fontFamily: '"Source Serif 4", Georgia, serif',
    resolvedFontFamily:
      "var(--font-source-serif-4), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"Source Serif 4 Variable", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.classicSerif",
    category: "serif",
    scripts: ["latin"],
    useCases: ["body", "editorial"],
    assetKey: "latin-serif",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/adobe-fonts/source-serif",
  },
  {
    id: "bitter",
    name: "Bitter",
    fontFamily: '"Bitter", serif',
    resolvedFontFamily:
      "var(--font-bitter), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"Bitter Variable", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.slabSerif",
    category: "serif",
    scripts: ["latin"],
    useCases: ["body", "editorial"],
    assetKey: "latin-serif",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/solmatas/BitterPro",
  },
  {
    id: "lora",
    name: "Lora",
    fontFamily: '"Lora", serif',
    resolvedFontFamily:
      "var(--font-lora), var(--font-noto-serif-sc), serif",
    fontLoadFamily: '"Lora Variable", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.editorialSerif",
    category: "serif",
    scripts: ["latin"],
    useCases: ["body", "editorial"],
    assetKey: "latin-serif",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/cyrealtype/Lora-Cyrillic",
  },
  {
    id: "merriweather",
    name: "Merriweather",
    fontFamily: '"Merriweather", serif',
    resolvedFontFamily:
      "var(--font-merriweather), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"Merriweather Variable", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.readableSerif",
    category: "serif",
    scripts: ["latin"],
    useCases: ["body", "editorial"],
    assetKey: "latin-serif",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/SorkinType/Merriweather",
  },
  {
    id: "playfair-display",
    name: "Playfair Display",
    fontFamily: '"Playfair Display", serif',
    resolvedFontFamily:
      "var(--font-playfair-display), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"Playfair Display Variable", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.displaySerif",
    category: "serif",
    scripts: ["latin"],
    useCases: ["display", "editorial"],
    assetKey: "latin-serif",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/clauseggers/Playfair-Display",
  },
  {
    id: "lxgw-marker-gothic",
    name: "LXGW Marker Gothic",
    fontFamily: '"LXGW Marker Gothic", "Noto Sans SC", sans-serif',
    resolvedFontFamily:
      "var(--font-lxgw-marker-gothic), var(--font-noto-sans-sc), sans-serif",
    fontLoadFamily:
      '"LXGW Marker Gothic", "Noto Sans SC Variable", sans-serif',
    descriptionKey: "editor.fontPreset.markerGothic",
    category: "handwriting",
    scripts: ["latin", "zh-CN"],
    useCases: ["creative", "display"],
    assetKey: "cjk-sans",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/lxgw/LxgwMarkerGothic",
  },
  {
    id: "lxgw-wenkai",
    name: "LXGW WenKai",
    fontFamily: '"LXGW WenKai", serif',
    resolvedFontFamily:
      "var(--font-lxgw-wenkai), var(--font-noto-serif-sc), serif",
    fontLoadFamily: '"LXGW WenKai", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.chineseHandwriting",
    category: "handwriting",
    scripts: ["latin", "zh-CN"],
    useCases: ["body", "creative"],
    assetKey: "cjk-serif-display",
    addedAt: "2026-08-01",
    license: "OFL-1.1",
    source: "https://github.com/lxgw/LxgwWenKai",
  },
  {
    id: "ma-shan-zheng",
    name: "Ma Shan Zheng",
    fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
    resolvedFontFamily:
      "var(--font-ma-shan-zheng), var(--font-noto-serif-sc), serif",
    fontLoadFamily:
      '"Ma Shan Zheng", "Noto Serif SC Variable", serif',
    descriptionKey: "editor.fontPreset.brushCalligraphy",
    category: "handwriting",
    scripts: ["latin", "zh-CN"],
    useCases: ["creative", "display"],
    assetKey: "cjk-serif-display",
    addedAt: "2026-10-15",
    license: "OFL-1.1",
    source: "https://github.com/googlefonts/mashanzheng",
  },
];

const DEFAULT_RESUME_FONT_PRESET = RESUME_FONT_PRESETS[0]!;

export function listResumeFontPresets() {
  return RESUME_FONT_PRESETS;
}

export function getResumeFontPreset(id: string) {
  return RESUME_FONT_PRESETS.find((preset) => preset.id === id);
}

export function getResumeFontPresetByFamily(fontFamily: string) {
  return RESUME_FONT_PRESETS.find((preset) => preset.fontFamily === fontFamily);
}

export function isResumeFontFamilyAllowed(fontFamily: string) {
  return RESUME_FONT_PRESETS.some(
    (preset) => preset.fontFamily === fontFamily,
  );
}

export function filterResumeFontPresets(
  query: string,
  options: {
    category?: ResumeFontCategory | "all";
    getDescription?: (preset: ResumeFontPreset) => string;
    getCategoryLabel?: (category: ResumeFontCategory) => string;
    getScriptLabel?: (script: ResumeFontScript) => string;
  } = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return RESUME_FONT_PRESETS.filter((preset) => {
    if (
      options.category &&
      options.category !== "all" &&
      preset.category !== options.category
    ) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const metadata = [
      preset.id,
      preset.name,
      preset.category,
      options.getDescription?.(preset),
      options.getCategoryLabel?.(preset.category),
      ...preset.scripts.flatMap((script) => [
        script,
        options.getScriptLabel?.(script),
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return metadata.includes(normalizedQuery);
  });
}

export function resolveResumeFontFamily(fontFamily: string) {
  return (
    RESUME_FONT_PRESETS.find((preset) => preset.fontFamily === fontFamily)
      ?.resolvedFontFamily ?? DEFAULT_RESUME_FONT_PRESET.resolvedFontFamily
  );
}
