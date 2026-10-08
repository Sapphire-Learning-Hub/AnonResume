import ImportExportEnglish from "@/content/docs/import-export.en-US.mdx";
import ImportExportChinese from "@/content/docs/import-export.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": ImportExportEnglish, "zh-CN": ImportExportChinese },
  eyebrowKey: "docs.importExport.eyebrow",
  leadKey: "docs.importExport.lead",
  pathname: "/docs/import-export",
  sections: [
    { id: "import-content", labelKey: "docs.importExport.section.import" },
    { id: "publish-share", labelKey: "docs.importExport.section.publish" },
    { id: "export-pdf", labelKey: "docs.importExport.section.pdf" },
    { id: "export-account", labelKey: "docs.importExport.section.account" },
  ],
  titleKey: "docs.importExport.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function ImportExportHelpPage() {
  return renderHelpArticle(definition);
}
