import MarkdownEditorEnglish from "@/content/docs/markdown-editor.en-US.mdx";
import MarkdownEditorChinese from "@/content/docs/markdown-editor.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: {
    "en-US": MarkdownEditorEnglish,
    "zh-CN": MarkdownEditorChinese,
  },
  eyebrowKey: "docs.markdownEditor.eyebrow",
  leadKey: "docs.markdownEditor.lead",
  pathname: "/docs/markdown-editor",
  sections: [
    { id: "start-editing", labelKey: "docs.markdownEditor.section.start" },
    { id: "page-theme", labelKey: "docs.markdownEditor.section.settings" },
    { id: "content-structure", labelKey: "docs.markdownEditor.section.structure" },
    { id: "diagnostics", labelKey: "docs.markdownEditor.section.diagnostics" },
    { id: "compatibility", labelKey: "docs.markdownEditor.section.compatibility" },
  ],
  titleKey: "docs.markdownEditor.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function MarkdownEditorHelpPage() {
  return renderHelpArticle(definition);
}
