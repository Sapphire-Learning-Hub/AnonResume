export type PublicResumeAppearance = Readonly<{
  theme: "auto" | "light" | "dark";
  surface: "soft" | "plain";
  header: "full" | "title" | "none";
  labels: "show" | "hide";
  frame: "shadow" | "border" | "none";
  align: "center" | "left";
  background?: string;
  accent?: string;
  padding: number;
  width: number;
  gap: number;
}>;

export type PublicResumeAppearanceField = Readonly<
  | {
      key: string;
      property: "theme" | "surface" | "header" | "labels" | "frame" | "align";
      kind: "enum";
      defaultValue: string;
      values: readonly string[];
    }
  | {
      key: string;
      property: "background" | "accent";
      kind: "color";
      defaultValue: undefined;
    }
  | {
      key: string;
      property: "padding" | "width" | "gap";
      kind: "integer";
      defaultValue: number;
      min: number;
      max: number;
    }
>;

const THEME_VALUES = ["auto", "light", "dark"] as const;
const SURFACE_VALUES = ["soft", "plain"] as const;
const HEADER_VALUES = ["full", "title", "none"] as const;
const LABEL_VALUES = ["show", "hide"] as const;
const FRAME_VALUES = ["shadow", "border", "none"] as const;
const ALIGN_VALUES = ["center", "left"] as const;

export const PUBLIC_RESUME_APPEARANCE_DEFAULTS: PublicResumeAppearance =
  Object.freeze({
    theme: "auto",
    surface: "soft",
    header: "full",
    labels: "show",
    frame: "shadow",
    align: "center",
    background: undefined,
    accent: undefined,
    padding: 24,
    width: 960,
    gap: 24,
  });

export const PUBLIC_RESUME_APPEARANCE_FIELDS = Object.freeze([
  Object.freeze({
    key: "view-theme",
    property: "theme",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.theme,
    values: THEME_VALUES,
  }),
  Object.freeze({
    key: "view-surface",
    property: "surface",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.surface,
    values: SURFACE_VALUES,
  }),
  Object.freeze({
    key: "view-header",
    property: "header",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.header,
    values: HEADER_VALUES,
  }),
  Object.freeze({
    key: "view-labels",
    property: "labels",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.labels,
    values: LABEL_VALUES,
  }),
  Object.freeze({
    key: "view-frame",
    property: "frame",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.frame,
    values: FRAME_VALUES,
  }),
  Object.freeze({
    key: "view-align",
    property: "align",
    kind: "enum",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.align,
    values: ALIGN_VALUES,
  }),
  Object.freeze({
    key: "view-background",
    property: "background",
    kind: "color",
    defaultValue: undefined,
  }),
  Object.freeze({
    key: "view-accent",
    property: "accent",
    kind: "color",
    defaultValue: undefined,
  }),
  Object.freeze({
    key: "view-padding",
    property: "padding",
    kind: "integer",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.padding,
    min: 0,
    max: 96,
  }),
  Object.freeze({
    key: "view-width",
    property: "width",
    kind: "integer",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.width,
    min: 640,
    max: 1440,
  }),
  Object.freeze({
    key: "view-gap",
    property: "gap",
    kind: "integer",
    defaultValue: PUBLIC_RESUME_APPEARANCE_DEFAULTS.gap,
    min: 0,
    max: 64,
  }),
] satisfies readonly PublicResumeAppearanceField[]);

type SearchParameterInput = Record<
  string,
  string | string[] | undefined
>;

function readScalar(input: SearchParameterInput, key: string) {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function parseEnum<const TValue extends string>(
  value: string | undefined,
  values: readonly TValue[],
  fallback: TValue,
): TValue {
  return values.find((candidate) => candidate === value) ?? fallback;
}

function parseColor(value: string | undefined) {
  return value && /^[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}

function parseInteger(
  value: string | undefined,
  constraints: { min: number; max: number; fallback: number },
) {
  if (!value || !/^\d+$/.test(value)) return constraints.fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= constraints.min &&
    parsed <= constraints.max
    ? parsed
    : constraints.fallback;
}

export function parsePublicResumeAppearance(
  input: SearchParameterInput,
): PublicResumeAppearance {
  return Object.freeze({
    theme: parseEnum(
      readScalar(input, "view-theme"),
      THEME_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.theme,
    ),
    surface: parseEnum(
      readScalar(input, "view-surface"),
      SURFACE_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.surface,
    ),
    header: parseEnum(
      readScalar(input, "view-header"),
      HEADER_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.header,
    ),
    labels: parseEnum(
      readScalar(input, "view-labels"),
      LABEL_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.labels,
    ),
    frame: parseEnum(
      readScalar(input, "view-frame"),
      FRAME_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.frame,
    ),
    align: parseEnum(
      readScalar(input, "view-align"),
      ALIGN_VALUES,
      PUBLIC_RESUME_APPEARANCE_DEFAULTS.align,
    ),
    background: parseColor(readScalar(input, "view-background")),
    accent: parseColor(readScalar(input, "view-accent")),
    padding: parseInteger(readScalar(input, "view-padding"), {
      min: 0,
      max: 96,
      fallback: PUBLIC_RESUME_APPEARANCE_DEFAULTS.padding,
    }),
    width: parseInteger(readScalar(input, "view-width"), {
      min: 640,
      max: 1440,
      fallback: PUBLIC_RESUME_APPEARANCE_DEFAULTS.width,
    }),
    gap: parseInteger(readScalar(input, "view-gap"), {
      min: 0,
      max: 64,
      fallback: PUBLIC_RESUME_APPEARANCE_DEFAULTS.gap,
    }),
  });
}

export function serializePublicResumeAppearance(
  appearance: PublicResumeAppearance,
) {
  const searchParams = new URLSearchParams();

  if (appearance.theme !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.theme) {
    searchParams.set("view-theme", appearance.theme);
  }
  if (appearance.surface !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.surface) {
    searchParams.set("view-surface", appearance.surface);
  }
  if (appearance.header !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.header) {
    searchParams.set("view-header", appearance.header);
  }
  if (appearance.labels !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.labels) {
    searchParams.set("view-labels", appearance.labels);
  }
  if (appearance.frame !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.frame) {
    searchParams.set("view-frame", appearance.frame);
  }
  if (appearance.align !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.align) {
    searchParams.set("view-align", appearance.align);
  }
  if (appearance.background) {
    searchParams.set("view-background", appearance.background);
  }
  if (appearance.accent) {
    searchParams.set("view-accent", appearance.accent);
  }
  if (appearance.padding !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.padding) {
    searchParams.set("view-padding", String(appearance.padding));
  }
  if (appearance.width !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.width) {
    searchParams.set("view-width", String(appearance.width));
  }
  if (appearance.gap !== PUBLIC_RESUME_APPEARANCE_DEFAULTS.gap) {
    searchParams.set("view-gap", String(appearance.gap));
  }

  return searchParams;
}

function linearizeRgbChannel(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function resolvePublicResumeChromeTheme(
  appearance: PublicResumeAppearance,
): "auto" | "light" | "dark" {
  if (appearance.theme !== "auto") return appearance.theme;
  if (!appearance.background) return "auto";

  const red = Number.parseInt(appearance.background.slice(0, 2), 16);
  const green = Number.parseInt(appearance.background.slice(2, 4), 16);
  const blue = Number.parseInt(appearance.background.slice(4, 6), 16);
  const luminance =
    0.2126 * linearizeRgbChannel(red) +
    0.7152 * linearizeRgbChannel(green) +
    0.0722 * linearizeRgbChannel(blue);

  return luminance > 0.179 ? "light" : "dark";
}
