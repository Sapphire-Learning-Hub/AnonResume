import { getRuntimeConfig } from "@/lib/config/runtime";

export interface DocsRuntimeConfiguration {
  aiEnabled: boolean;
  privacyPolicyUrl: string;
  supportUrl: string;
  termsOfServiceUrl: string;
}

const fallbackConfiguration: DocsRuntimeConfiguration = {
  aiEnabled: false,
  privacyPolicyUrl: "",
  supportUrl: "",
  termsOfServiceUrl: "",
};

export async function getDocsRuntimeConfiguration(): Promise<DocsRuntimeConfiguration> {
  try {
    const runtime = await getRuntimeConfig("web");
    return {
      aiEnabled: runtime.values.aiEnabled,
      privacyPolicyUrl: runtime.values.privacyPolicyUrl,
      supportUrl: runtime.values.supportUrl,
      termsOfServiceUrl: runtime.values.termsOfServiceUrl,
    };
  } catch {
    return fallbackConfiguration;
  }
}
