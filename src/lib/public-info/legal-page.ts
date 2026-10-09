import { getRuntimeConfig } from "@/lib/config/runtime";

export interface LegalPageConfiguration {
  legalContactEmail: string;
  legalEffectiveDate: string;
  legalOperatorName: string;
  privacyPolicyUrl: string;
  supportUrl: string;
  termsOfServiceUrl: string;
}

const fallbackConfiguration: LegalPageConfiguration = {
  legalContactEmail: "",
  legalEffectiveDate: "",
  legalOperatorName: "",
  privacyPolicyUrl: "",
  supportUrl: "",
  termsOfServiceUrl: "",
};

export async function getLegalPageConfiguration(): Promise<LegalPageConfiguration> {
  try {
    const runtime = await getRuntimeConfig("web");
    return {
      legalContactEmail: runtime.values.legalContactEmail,
      legalEffectiveDate: runtime.values.legalEffectiveDate,
      legalOperatorName: runtime.values.legalOperatorName,
      privacyPolicyUrl: runtime.values.privacyPolicyUrl,
      supportUrl: runtime.values.supportUrl,
      termsOfServiceUrl: runtime.values.termsOfServiceUrl,
    };
  } catch {
    return fallbackConfiguration;
  }
}
