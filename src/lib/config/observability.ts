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
    (!normalized.includes(".") && !normalized.includes(":")) ||
    /^(fc|fd)[a-f0-9]{2}:/.test(normalized) ||
    /^fe[89ab][a-f0-9]:/.test(normalized)
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

function parseEndpoint(value: string, field = "metricsOtlpEndpoint", suffix = "/v1/metrics") {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new MetricsConfigurationValidationError([field]);
  }

  const isHttpAllowed =
    endpoint.protocol === "http:" && isPrivateHttpHostname(endpoint.hostname);
  if (
    (endpoint.protocol !== "https:" && !isHttpAllowed) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.pathname.endsWith(suffix)
  ) {
    throw new MetricsConfigurationValidationError([field]);
  }
  return endpoint.toString();
}

function parseHeaders(value: string, field = "metricsOtlpHeaders") {
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
      throw new MetricsConfigurationValidationError([field]);
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
  parseTracingConfiguration(config);
  return config;
}

export function parseTracingConfiguration(config: ManagedConfig) {
  if (!config.tracingEnabled) return { enabled: false } as const;
  return {
    enabled: true as const,
    endpoint: parseEndpoint(config.tracingOtlpEndpoint, "tracingOtlpEndpoint", "/v1/traces"),
    headers: parseHeaders(config.tracingOtlpHeaders, "tracingOtlpHeaders"),
    sampleRate: config.tracingSampleRate,
    exportTimeoutMs: config.tracingExportTimeoutMs,
  };
}
