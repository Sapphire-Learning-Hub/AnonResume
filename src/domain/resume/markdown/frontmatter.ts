import type {
  ResumeMarkdownDiagnostic,
  ResumeMarkdownFrontMatter,
  ResumeMarkdownFrontMatterResult,
} from "./types";

export const MAX_RESUME_MARKDOWN_BYTES = 512 * 1024;

const FRONT_MATTER_KEYS = new Set([
  "anonresume",
  "title",
  "locale",
  "page-margin",
  "font-family",
  "font-size",
  "line-height",
  "accent",
  "text-color",
  "muted-color",
]);

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const UNSAFE_SCALAR_PATTERN = /(?:^|\s)(?:!!|[&*!|>])[\w-]*|[\[\]{}]/;

function diagnostic(
  code: string,
  line: number,
  column: number,
  parameters: Record<string, string | number> = {},
  severity: ResumeMarkdownDiagnostic["severity"] = "error",
): ResumeMarkdownDiagnostic {
  return { severity, code, parameters, line, column };
}

function parseScalar(value: string) {
  const trimmed = value.trim();

  if (!trimmed || UNSAFE_SCALAR_PATTERN.test(trimmed)) {
    return undefined;
  }

  if (trimmed.startsWith('"') || trimmed.endsWith('"')) {
    if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return trimmed;
}

function parsePositiveNumber(value: string) {
  if (!NUMBER_PATTERN.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function quote(value: string) {
  return JSON.stringify(value);
}

export function parseResumeMarkdownFrontMatter(
  source: string,
): ResumeMarkdownFrontMatterResult {
  if (new TextEncoder().encode(source).byteLength > MAX_RESUME_MARKDOWN_BYTES) {
    return {
      body: "",
      bodyStartLine: 1,
      diagnostics: [diagnostic("source_too_large", 1, 1)],
    };
  }

  const lines = source.replaceAll("\r\n", "\n").split("\n");

  if (lines[0]?.trim() !== "---") {
    return {
      body: source,
      bodyStartLine: 1,
      diagnostics: [diagnostic("frontmatter_required", 1, 1)],
    };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );

  if (closingIndex === -1) {
    return {
      body: "",
      bodyStartLine: lines.length + 1,
      diagnostics: [diagnostic("frontmatter_unclosed", 1, 1)],
    };
  }

  const diagnostics: ResumeMarkdownDiagnostic[] = [];
  const seen = new Set<string>();
  const parsed: Partial<ResumeMarkdownFrontMatter> & { version?: 1 } = {};

  for (let index = 1; index < closingIndex; index += 1) {
    const rawLine = lines[index]!;
    const lineNumber = index + 1;

    if (!rawLine.trim()) continue;

    const match = /^([a-z][a-z0-9-]*):(?:\s*(.*))$/.exec(rawLine);

    if (!match) {
      diagnostics.push(
        diagnostic("frontmatter_invalid_entry", lineNumber, 1),
      );
      continue;
    }

    const [, key, rawValue = ""] = match;
    const valueColumn = rawLine.indexOf(":") + 2;

    if (!FRONT_MATTER_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          "frontmatter_unknown_key",
          lineNumber,
          1,
          { key },
          "warning",
        ),
      );
      continue;
    }

    if (seen.has(key)) {
      diagnostics.push(
        diagnostic("frontmatter_duplicate_key", lineNumber, 1, { key }),
      );
      continue;
    }
    seen.add(key);

    const scalar = parseScalar(rawValue);
    if (scalar === undefined) {
      diagnostics.push(
        diagnostic("frontmatter_invalid_scalar", lineNumber, valueColumn, {
          key,
        }),
      );
      continue;
    }

    switch (key) {
      case "anonresume":
        if (scalar !== "1") {
          diagnostics.push(
            diagnostic(
              "frontmatter_unsupported_version",
              lineNumber,
              valueColumn,
              { version: scalar },
            ),
          );
        } else {
          parsed.version = 1;
        }
        break;
      case "title":
        parsed.title = scalar;
        break;
      case "locale":
        parsed.locale = scalar;
        break;
      case "font-family":
        parsed.fontFamily = scalar;
        break;
      case "page-margin": {
        const values = scalar.split(/\s+/).map(Number);
        if (
          values.length !== 4 ||
          values.some((number) => !Number.isFinite(number) || number < 0)
        ) {
          diagnostics.push(
            diagnostic(
              "frontmatter_invalid_page_margin",
              lineNumber,
              valueColumn,
            ),
          );
        } else {
          parsed.pageMargin = {
            top: values[0]!,
            right: values[1]!,
            bottom: values[2]!,
            left: values[3]!,
          };
        }
        break;
      }
      case "font-size":
      case "line-height": {
        const number = parsePositiveNumber(scalar);
        if (number === undefined) {
          diagnostics.push(
            diagnostic("frontmatter_invalid_number", lineNumber, valueColumn, {
              key,
            }),
          );
        } else if (key === "font-size") {
          parsed.fontSize = number;
        } else {
          parsed.lineHeight = number;
        }
        break;
      }
      case "accent":
      case "text-color":
      case "muted-color":
        if (!COLOR_PATTERN.test(scalar)) {
          diagnostics.push(
            diagnostic("frontmatter_invalid_color", lineNumber, valueColumn, {
              key,
            }),
          );
        } else if (key === "accent") {
          parsed.accent = scalar;
        } else if (key === "text-color") {
          parsed.textColor = scalar;
        } else {
          parsed.mutedColor = scalar;
        }
        break;
    }
  }

  if (!seen.has("anonresume")) {
    diagnostics.unshift(diagnostic("frontmatter_version_required", 2, 1));
  }

  const hasErrors = diagnostics.some((item) => item.severity === "error");

  return {
    ...(hasErrors ? {} : { frontMatter: parsed as ResumeMarkdownFrontMatter }),
    body: lines.slice(closingIndex + 1).join("\n"),
    bodyStartLine: closingIndex + 2,
    diagnostics,
  };
}

export function serializeResumeMarkdownFrontMatter(
  frontMatter: ResumeMarkdownFrontMatter,
) {
  const lines = ["---", "anonresume: 1"];

  if (frontMatter.title !== undefined) {
    lines.push(`title: ${quote(frontMatter.title)}`);
  }
  if (frontMatter.locale !== undefined) {
    lines.push(`locale: ${frontMatter.locale}`);
  }
  if (frontMatter.pageMargin !== undefined) {
    const { top, right, bottom, left } = frontMatter.pageMargin;
    lines.push(`page-margin: ${top} ${right} ${bottom} ${left}`);
  }
  if (frontMatter.fontFamily !== undefined) {
    lines.push(`font-family: ${quote(frontMatter.fontFamily)}`);
  }
  if (frontMatter.fontSize !== undefined) {
    lines.push(`font-size: ${frontMatter.fontSize}`);
  }
  if (frontMatter.lineHeight !== undefined) {
    lines.push(`line-height: ${frontMatter.lineHeight}`);
  }
  if (frontMatter.accent !== undefined) {
    lines.push(`accent: ${quote(frontMatter.accent)}`);
  }
  if (frontMatter.textColor !== undefined) {
    lines.push(`text-color: ${quote(frontMatter.textColor)}`);
  }
  if (frontMatter.mutedColor !== undefined) {
    lines.push(`muted-color: ${quote(frontMatter.mutedColor)}`);
  }

  lines.push("---");
  return lines.join("\n");
}
