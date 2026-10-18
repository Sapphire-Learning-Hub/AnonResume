import type { ManagedConfig } from "@/lib/config/registry";

const FORBIDDEN_HEADERS = new Set([
  "content-length",
  "host",
  "transfer-encoding",
]);
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type MetricsConfiguration =
  | { enabled: false }
  | {
      enabled: true;
      endpoint: string;
      exportIntervalMs: number;
      exportTimeoutMs: number;
      headers: Readonly<Record<string, string>>;
    };

export class MetricsConfigurationValidationError extends Error {
  readonly code = "configuration_invalid";

  constructor(readonly fields: readonly string[]) {
    super(`configuration_invalid:${fields.join(",")}`);
    this.name = "MetricsConfigurationValidationError";
  }
}

function isPrivateHttpHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    !normalized.includes(".")
  ) {
    return true;
  }

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function parseEndpoint(value: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new MetricsConfigurationValidationError(["metricsOtlpEndpoint"]);
  }

  const isHttpAllowed =
    endpoint.protocol === "http:" && isPrivateHttpHostname(endpoint.hostname);
  if (
    (endpoint.protocol !== "https:" && !isHttpAllowed) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.endsWith("/v1/metrics")
  ) {
    throw new MetricsConfigurationValidationError(["metricsOtlpEndpoint"]);
  }
  return endpoint.toString();
}

function parseHeaders(value: string) {
  const headers: Record<string, string> = {};
  if (!value.trim()) return headers;

  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    const name = entry.slice(0, separator).trim().toLowerCase();
    const headerValue = entry.slice(separator + 1).trim();
    if (
      separator <= 0 ||
      !HEADER_NAME.test(name) ||
      !headerValue ||
      FORBIDDEN_HEADERS.has(name) ||
      Object.hasOwn(headers, name) ||
      /[\u0000-\u001f\u007f]/.test(headerValue)
    ) {
      throw new MetricsConfigurationValidationError(["metricsOtlpHeaders"]);
    }
    headers[name] = headerValue;
  }
  return headers;
}

export function parseMetricsConfiguration(
  config: ManagedConfig,
): MetricsConfiguration {
  if (!config.metricsEnabled) return { enabled: false };

  if (!config.metricsOtlpEndpoint.trim()) {
    throw new MetricsConfigurationValidationError(["metricsOtlpEndpoint"]);
  }
  if (config.metricsExportTimeoutMs > config.metricsExportIntervalMs) {
    throw new MetricsConfigurationValidationError(["metricsExportTimeoutMs"]);
  }

  return {
    enabled: true,
    endpoint: parseEndpoint(config.metricsOtlpEndpoint),
    exportIntervalMs: config.metricsExportIntervalMs,
    exportTimeoutMs: config.metricsExportTimeoutMs,
    headers: parseHeaders(config.metricsOtlpHeaders),
  };
}

export function validatePublishableManagedConfig(config: ManagedConfig) {
  parseMetricsConfiguration(config);
  return config;
}
