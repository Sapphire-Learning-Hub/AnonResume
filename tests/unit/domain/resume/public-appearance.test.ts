import { describe, expect, it } from "vitest";

import {
  PUBLIC_RESUME_APPEARANCE_DEFAULTS,
  PUBLIC_RESUME_APPEARANCE_FIELDS,
  parsePublicResumeAppearance,
  resolvePublicResumeChromeTheme,
  serializePublicResumeAppearance,
} from "@/domain/resume/public-appearance";

describe("public resume appearance", () => {
  it("uses immutable defaults when parameters are absent", () => {
    const result = parsePublicResumeAppearance({});

    expect(result).toEqual(PUBLIC_RESUME_APPEARANCE_DEFAULTS);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(PUBLIC_RESUME_APPEARANCE_DEFAULTS)).toBe(true);
  });

  it.each([
    ["view-theme", "theme", ["auto", "light", "dark"]],
    ["view-surface", "surface", ["soft", "plain"]],
    ["view-header", "header", ["full", "title", "none"]],
    ["view-labels", "labels", ["show", "hide"]],
    ["view-frame", "frame", ["shadow", "border", "none"]],
    ["view-align", "align", ["center", "left"]],
  ] as const)("accepts every value for %s", (key, property, values) => {
    for (const value of values) {
      expect(parsePublicResumeAppearance({ [key]: value })[property]).toBe(value);
    }
  });

  it("accepts and normalizes six-digit RGB colors", () => {
    expect(
      parsePublicResumeAppearance({
        "view-background": "000000",
        "view-accent": "FFFFFF",
      }),
    ).toMatchObject({
      background: "000000",
      accent: "ffffff",
    });
  });

  it.each([
    ["view-padding", "padding", "0", 0],
    ["view-padding", "padding", "96", 96],
    ["view-width", "width", "640", 640],
    ["view-width", "width", "1440", 1440],
    ["view-gap", "gap", "0", 0],
    ["view-gap", "gap", "64", 64],
  ] as const)("accepts the numeric boundary %s=%s", (key, property, value, expected) => {
    expect(parsePublicResumeAppearance({ [key]: value })[property]).toBe(expected);
  });

  it.each([
    ["view-theme", "sepia"],
    ["view-background", "fff"],
    ["view-background", "ffffffff"],
    ["view-background", "red"],
    ["view-background", "rgb(0,0,0)"],
    ["view-background", "url(https://example.com)"],
    ["view-background", "a".repeat(1_000)],
    ["view-padding", "-1"],
    ["view-padding", "+1"],
    ["view-padding", "1.5"],
    ["view-padding", "1px"],
    ["view-padding", "97"],
    ["view-width", "639"],
    ["view-width", "1441"],
    ["view-gap", "65"],
  ] as const)("falls back for invalid input %s=%s", (key, value) => {
    expect(parsePublicResumeAppearance({ [key]: value })).toEqual(
      PUBLIC_RESUME_APPEARANCE_DEFAULTS,
    );
  });

  it("falls back for repeated values and ignores unregistered parameters", () => {
    expect(
      parsePublicResumeAppearance({
        "view-theme": ["dark", "light"],
        "view-unknown": "anything",
      }),
    ).toEqual(PUBLIC_RESUME_APPEARANCE_DEFAULTS);
  });

  it("exposes stable registry metadata for every public parameter", () => {
    expect(PUBLIC_RESUME_APPEARANCE_FIELDS.map((field) => field.key)).toEqual([
      "view-theme",
      "view-surface",
      "view-header",
      "view-labels",
      "view-frame",
      "view-align",
      "view-background",
      "view-accent",
      "view-padding",
      "view-width",
      "view-gap",
    ]);
  });

  it("serializes non-default values in registry order", () => {
    const appearance = parsePublicResumeAppearance({
      "view-header": "none",
      "view-background": "ABCDEF",
      "view-theme": "dark",
      "view-padding": "0",
    });

    expect(serializePublicResumeAppearance(appearance).toString()).toBe(
      "view-theme=dark&view-header=none&view-background=abcdef&view-padding=0",
    );
  });

  it("omits defaults and round-trips normalized values", () => {
    const appearance = parsePublicResumeAppearance({
      "view-surface": "plain",
      "view-labels": "hide",
      "view-frame": "border",
      "view-align": "left",
      "view-accent": "CF3F70",
      "view-width": "1200",
      "view-gap": "8",
    });

    const serialized = serializePublicResumeAppearance(appearance);

    expect(serialized.has("view-theme")).toBe(false);
    expect(parsePublicResumeAppearance(Object.fromEntries(serialized))).toEqual(
      appearance,
    );
  });

  it("resolves explicit chrome themes before background luminance", () => {
    expect(
      resolvePublicResumeChromeTheme(
        parsePublicResumeAppearance({
          "view-theme": "light",
          "view-background": "000000",
        }),
      ),
    ).toBe("light");
    expect(
      resolvePublicResumeChromeTheme(
        parsePublicResumeAppearance({
          "view-theme": "dark",
          "view-background": "ffffff",
        }),
      ),
    ).toBe("dark");
  });

  it("derives readable chrome from a custom background in auto mode", () => {
    expect(
      resolvePublicResumeChromeTheme(
        parsePublicResumeAppearance({ "view-background": "000000" }),
      ),
    ).toBe("dark");
    expect(
      resolvePublicResumeChromeTheme(
        parsePublicResumeAppearance({ "view-background": "ffffff" }),
      ),
    ).toBe("light");
    expect(resolvePublicResumeChromeTheme(parsePublicResumeAppearance({}))).toBe(
      "auto",
    );
  });
});
