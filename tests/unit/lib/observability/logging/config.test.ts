import { describe, expect, it } from "vitest";

import { readLoggingConfiguration } from "@/lib/observability/logging";

describe("structured logging configuration", () => {
  it("uses development-friendly defaults outside production", () => {
    expect(readLoggingConfiguration({ NODE_ENV: "development" })).toEqual({
      environment: "development",
      format: "pretty",
      level: "debug",
    });
  });

  it("uses machine-readable production defaults", () => {
    expect(readLoggingConfiguration({ NODE_ENV: "production" })).toEqual({
      environment: "production",
      format: "json",
      level: "info",
    });
  });

  it("accepts explicit supported values and trims the environment name", () => {
    expect(
      readLoggingConfiguration({
        ANONRESUME_LOG_ENVIRONMENT: " staging-cn ",
        ANONRESUME_LOG_FORMAT: "json",
        ANONRESUME_LOG_LEVEL: "warn",
        NODE_ENV: "development",
      }),
    ).toEqual({
      environment: "staging-cn",
      format: "json",
      level: "warn",
    });
  });

  it.each([
    ["ANONRESUME_LOG_LEVEL", "verbose"],
    ["ANONRESUME_LOG_FORMAT", "text"],
    ["ANONRESUME_LOG_ENVIRONMENT", "contains spaces"],
  ])("rejects an invalid explicit %s without reflecting its value", (key, value) => {
    expect(() =>
      readLoggingConfiguration({
        NODE_ENV: "production",
        [key]: value,
      }),
    ).toThrow(key);

    try {
      readLoggingConfiguration({ NODE_ENV: "production", [key]: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
});
