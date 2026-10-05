import { deriveResumeThemePalette } from "@/domain/resume/theme/palette";
import { getResumeStyleVariables } from "@/styles/resume-style-vars";

function relativeLuminance(color: string) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );

  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );

  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("resume semantic theme palette", () => {
  it("derives stable accent surfaces with the existing visual proportions", () => {
    const palette = deriveResumeThemePalette({
      accent: "#0f62fe",
      textColor: "#0f172a",
      mutedColor: "#475569",
    });

    expect(palette).toEqual({
      pageBackground: "#ffffff",
      textForeground: "#0f172a",
      mutedForeground: "#475569",
      accent: "#0f62fe",
      accentForeground: "#0f61fd",
      accentSurface: "#ecf2ff",
      accentBorder: "#d4e3ff",
    });
  });

  it("treats shorthand and expanded hexadecimal colors equivalently", () => {
    const shorthand = deriveResumeThemePalette({
      accent: "#0f6",
      textColor: "#123",
      mutedColor: "#456",
    });
    const expanded = deriveResumeThemePalette({
      accent: "#00ff66",
      textColor: "#112233",
      mutedColor: "#445566",
    });

    expect(shorthand).toEqual(expanded);
  });

  it("only adjusts semantic foregrounds that miss readable contrast", () => {
    const palette = deriveResumeThemePalette({
      accent: "#ffff00",
      textColor: "#123456",
      mutedColor: "#dddddd",
    });

    expect(palette.textForeground).toBe("#123456");
    expect(palette.accentForeground).not.toBe("#ffff00");
    expect(palette.mutedForeground).not.toBe("#dddddd");
    expect(
      contrastRatio(palette.accentForeground, palette.accentSurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.mutedForeground, palette.pageBackground),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("publishes the derived values through the shared resume style variables", () => {
    const variables = getResumeStyleVariables({
      page: {
        size: "A4",
        margin: { top: 32, right: 32, bottom: 32, left: 32 },
      },
      typography: {
        fontFamily: '"IBM Plex Sans", sans-serif',
        baseFontSize: 14,
        lineHeight: 1.45,
      },
      theme: {
        accent: "#0f62fe",
        textColor: "#0f172a",
        mutedColor: "#475569",
      },
    });

    expect(variables).toMatchObject({
      "--resume-page-background": "#ffffff",
      "--resume-text-color": "#0f172a",
      "--resume-muted-color": "#475569",
      "--resume-accent": "#0f62fe",
      "--resume-accent-foreground": "#0f61fd",
      "--resume-accent-surface": "#ecf2ff",
      "--resume-accent-border": "#d4e3ff",
    });
  });
});
