import AccountEnglish from "@/content/docs/account-security.en-US.mdx";
import AccountChinese from "@/content/docs/account-security.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": AccountEnglish, "zh-CN": AccountChinese },
  eyebrowKey: "docs.accountSecurity.eyebrow",
  leadKey: "docs.accountSecurity.lead",
  pathname: "/docs/account-security",
  sections: [
    { id: "profile-password", labelKey: "docs.accountSecurity.section.credentials" },
    { id: "change-email", labelKey: "docs.accountSecurity.section.email" },
    { id: "login-devices", labelKey: "docs.accountSecurity.section.devices" },
    { id: "close-account", labelKey: "docs.accountSecurity.section.deletion" },
  ],
  titleKey: "docs.accountSecurity.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function AccountSecurityHelpPage() {
  return renderHelpArticle(definition);
}
