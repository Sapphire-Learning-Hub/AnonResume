import type {
  LoggingConfiguration,
  LogLevel,
} from "./types";
import { readLoggingEnvironment } from "@/lib/config/process-environment";

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);
const LOG_FORMATS = new Set<LoggingConfiguration["format"]>(["json", "pretty"]);
const ENVIRONMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function readExplicitValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
) {
  const value = environment[key]?.trim();
  return value ? value : undefined;
}

function invalidConfiguration(key: string): never {
  throw new Error(`Invalid logging configuration: ${key}`);
}

export function readLoggingConfiguration(
  environment?: NodeJS.ProcessEnv,
): LoggingConfiguration {
  const source = environment ?? readLoggingEnvironment();
  const production = source.NODE_ENV === "production";
  const explicitLevel = readExplicitValue(source, "ANONRESUME_LOG_LEVEL");
  const explicitFormat = readExplicitValue(source, "ANONRESUME_LOG_FORMAT");
  const explicitEnvironment = readExplicitValue(
    source,
    "ANONRESUME_LOG_ENVIRONMENT",
  );

  if (explicitLevel && !LOG_LEVELS.has(explicitLevel as LogLevel)) {
    invalidConfiguration("ANONRESUME_LOG_LEVEL");
  }
  if (
    explicitFormat &&
    !LOG_FORMATS.has(explicitFormat as LoggingConfiguration["format"])
  ) {
    invalidConfiguration("ANONRESUME_LOG_FORMAT");
  }
  if (explicitEnvironment && !ENVIRONMENT_NAME.test(explicitEnvironment)) {
    invalidConfiguration("ANONRESUME_LOG_ENVIRONMENT");
  }

  return {
    environment:
      explicitEnvironment ?? (source.NODE_ENV?.trim() || "development"),
    format:
      (explicitFormat as LoggingConfiguration["format"] | undefined) ??
      (production ? "json" : "pretty"),
    level:
      (explicitLevel as LogLevel | undefined) ??
      (production ? "info" : "debug"),
  };
}
