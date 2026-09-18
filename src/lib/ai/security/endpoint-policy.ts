import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface AiResolvedAddress {
  address: string;
  family: number;
}

export type AiDnsResolver = (
  hostname: string,
) => Promise<readonly AiResolvedAddress[]>;

const FORBIDDEN_HOSTNAMES = new Set([
  "instance-data",
  "metadata.google.internal",
  "metadata.azure.internal",
]);

function unsafeEndpoint(): never {
  throw new Error("unsafe_ai_endpoint");
}

function isUnsafeIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isProxyFakeIpv4(value: string) {
  const [a, b] = value.split(".").map(Number);
  return a === 198 && (b === 18 || b === 19);
}

function mappedIpv4(value: string) {
  const normalized = value.toLowerCase();
  if (!normalized.startsWith("::ffff:")) return undefined;
  const suffix = normalized.slice("::ffff:".length);
  if (isIP(suffix) === 4) return suffix;

  const groups = suffix.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return undefined;
  }
  const values = groups.map((group) => Number.parseInt(group, 16));
  return [values[0]! >> 8, values[0]! & 255, values[1]! >> 8, values[1]! & 255].join(".");
}

function isUnsafeIpv6(value: string) {
  const normalized = value.toLowerCase();
  const mapped = mappedIpv4(normalized);
  if (mapped) return isUnsafeIpv4(mapped);
  if (normalized === "::" || normalized === "::1") return true;

  const firstGroup = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  return firstGroup < 0x2000 || firstGroup > 0x3fff || normalized.startsWith("2001:db8:");
}

function isUnsafeAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isUnsafeIpv4(address);
  if (family === 6) return isUnsafeIpv6(address);
  return true;
}

async function resolveAll(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function resolveSafeAiEndpoint(
  value: string | URL,
  resolver: AiDnsResolver = resolveAll,
  trustedProxyHostnames: ReadonlySet<string> = new Set(),
) {
  let endpoint: URL;
  try {
    endpoint = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    return unsafeEndpoint();
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hostname.length > 253
  ) {
    return unsafeEndpoint();
  }

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    FORBIDDEN_HOSTNAMES.has(hostname)
  ) {
    return unsafeEndpoint();
  }

  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await resolver(hostname);

  const unsafeAddresses = addresses.filter(({ address }) =>
    isUnsafeAddress(address),
  );
  const trustedProxyResolution =
    directFamily === 0 &&
    trustedProxyHostnames.has(hostname) &&
    unsafeAddresses.length > 0 &&
    unsafeAddresses.every(
      ({ address }) => isIP(address) === 4 && isProxyFakeIpv4(address),
    );

  if (addresses.length === 0 || (unsafeAddresses.length > 0 && !trustedProxyResolution)) {
    return unsafeEndpoint();
  }

  return { endpoint, addresses };
}

export async function assertSafeAiEndpoint(
  value: string | URL,
  resolver: AiDnsResolver = resolveAll,
  trustedProxyHostnames: ReadonlySet<string> = new Set(),
) {
  const resolved = await resolveSafeAiEndpoint(
    value,
    resolver,
    trustedProxyHostnames,
  );
  return resolved.endpoint;
}
