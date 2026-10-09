import TermsEnglish from "@/content/legal/terms.en-US.mdx";
import TermsChinese from "@/content/legal/terms.zh-CN.mdx";

import {
  createLegalPolicyMetadata,
  type LegalPolicyDefinition,
  renderLegalPolicy,
} from "../_legal/legal-policy";

const definition = {
  content: { "en-US": TermsEnglish, "zh-CN": TermsChinese },
  descriptionKey: "legal.terms.description",
  kind: "terms",
  titleKey: "legal.terms.title",
} as const satisfies LegalPolicyDefinition;

export const generateMetadata = () => createLegalPolicyMetadata(definition);

export default function TermsPage() {
  return renderLegalPolicy(definition);
}
