import PrivacyEnglish from "@/content/legal/privacy.en-US.mdx";
import PrivacyChinese from "@/content/legal/privacy.zh-CN.mdx";

import {
  createLegalPolicyMetadata,
  type LegalPolicyDefinition,
  renderLegalPolicy,
} from "../_legal/legal-policy";

const definition = {
  content: { "en-US": PrivacyEnglish, "zh-CN": PrivacyChinese },
  descriptionKey: "legal.privacy.description",
  kind: "privacy",
  titleKey: "legal.privacy.title",
} as const satisfies LegalPolicyDefinition;

export const generateMetadata = () => createLegalPolicyMetadata(definition);

export default function PrivacyPage() {
  return renderLegalPolicy(definition);
}
