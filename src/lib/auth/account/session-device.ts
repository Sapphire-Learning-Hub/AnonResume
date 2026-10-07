import { userAgentFromString } from "next/server";

export type AccountSessionDeviceType =
  | "console"
  | "desktop"
  | "embedded"
  | "mobile"
  | "smarttv"
  | "tablet"
  | "unknown"
  | "wearable";

export type AccountSessionDevice = {
  type: AccountSessionDeviceType;
  vendor: string | null;
  model: string | null;
  os: {
    name: string;
    version: string | null;
    versionIsMinimum: boolean;
  } | null;
};

export type AccountSessionDeviceMetadata = {
  platform: string | null;
  platformVersion: string | null;
  model: string | null;
};

export const sessionDeviceAdditionalFields = {
  deviceModel: {
    type: "string",
    required: false,
    returned: false,
    input: false,
    fieldName: "deviceModel",
  },
  platform: {
    type: "string",
    required: false,
    returned: false,
    input: false,
    fieldName: "platform",
  },
  platformVersion: {
    type: "string",
    required: false,
    returned: false,
    input: false,
    fieldName: "platformVersion",
  },
} as const;

const supportedDeviceTypes = new Set<AccountSessionDeviceType>([
  "console",
  "embedded",
  "mobile",
  "smarttv",
  "tablet",
  "wearable",
]);

export function parseAccountSessionDevice(
  userAgent: string | null,
  metadata: AccountSessionDeviceMetadata = {
    platform: null,
    platformVersion: null,
    model: null,
  },
): AccountSessionDevice {
  const parsed = userAgentFromString(userAgent || undefined);
  const hasRecognizedClient = Boolean(
    parsed.browser.name ||
    parsed.os.name ||
    parsed.device.model ||
    parsed.device.vendor,
  );
  const parsedType = parsed.device.type as AccountSessionDeviceType | undefined;
  const type = parsedType && supportedDeviceTypes.has(parsedType)
    ? parsedType
    : hasRecognizedClient && !parsed.isBot
      ? "desktop"
      : "unknown";
  const parsedOsName = parsed.os.name?.trim() || null;
  const metadataPlatform = metadata.platform?.trim() || null;
  const osName = normalizePlatformName(metadataPlatform || parsedOsName);
  const parsedOsVersion = parsed.os.version?.trim() || null;
  const chromiumMacVersionIsFrozen = osName === "macOS" &&
    parsedOsVersion === "10.15.7" &&
    /(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent || "");
  const metadataVersion = metadata.platformVersion?.trim() || null;
  const osVersion = osName === "macOS"
    ? normalizeMacOSVersion(metadataVersion) ||
      (chromiumMacVersionIsFrozen ? null : parsedOsVersion)
    : metadataVersion || parsedOsVersion;
  const model = metadata.model?.trim() || parsed.device.model?.trim() || null;

  return {
    type,
    vendor: parsed.device.vendor?.trim() || null,
    model,
    os: osName
      ? {
          name: osName,
          version: osVersion,
          versionIsMinimum:
            osName === "Windows" && osVersion === "10",
        }
      : null,
  };
}

function normalizePlatformName(platform: string | null) {
  if (!platform) return null;
  if (platform === "Mac OS" || platform === "Mac OS X" || platform === "macOS") {
    return "macOS";
  }
  return platform;
}

function normalizeMacOSVersion(version: string | null) {
  if (!version) return null;
  const parts = version.split(".");
  const major = Number.parseInt(parts[0] || "", 10);
  if (!Number.isInteger(major)) return null;

  // Darwin 20-25 correspond to Big Sur 11 through Tahoe 26. Modern
  // User-Agent Client Hints usually return the public macOS version directly,
  // so only the known non-public major range needs conversion.
  if (major >= 20 && major <= 24) {
    parts[0] = String(major - 9);
  } else if (major === 25) {
    parts[0] = "26";
  }
  return parts.join(".");
}
