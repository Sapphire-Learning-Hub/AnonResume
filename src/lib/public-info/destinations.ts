import type { ManagedConfig } from "@/lib/config/registry";

export interface PublicDestination {
  external: boolean;
  href: string;
}

export interface PublicInformationDestinations {
  privacy: PublicDestination;
  support: PublicDestination;
  terms: PublicDestination;
}

type PublicInformationDestinationConfig = Pick<
  ManagedConfig,
  "privacyPolicyUrl" | "supportUrl" | "termsOfServiceUrl"
>;

function destination(configuredUrl: string, fallbackHref: string) {
  return configuredUrl
    ? { external: true, href: configuredUrl }
    : { external: false, href: fallbackHref };
}

export function resolvePublicInformationDestinations(
  config: PublicInformationDestinationConfig,
): PublicInformationDestinations {
  return {
    privacy: destination(config.privacyPolicyUrl, "/privacy"),
    support: destination(config.supportUrl, "/docs/support"),
    terms: destination(config.termsOfServiceUrl, "/terms"),
  };
}
