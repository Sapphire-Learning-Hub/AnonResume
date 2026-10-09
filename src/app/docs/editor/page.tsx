import EditorEnglish from "@/content/docs/editor.en-US.mdx";
import EditorChinese from "@/content/docs/editor.zh-CN.mdx";

import {
  createHelpArticleMetadata,
  type HelpArticleDefinition,
  renderHelpArticle,
} from "../_shared/help-article";

const definition = {
  content: { "en-US": EditorEnglish, "zh-CN": EditorChinese },
  eyebrowKey: "docs.editor.eyebrow",
  leadKey: "docs.editor.lead",
  pathname: "/docs/editor",
  sections: [
    { id: "edit-content", labelKey: "docs.editor.section.content" },
    { id: "design-layout", labelKey: "docs.editor.section.design" },
    { id: "save-review", labelKey: "docs.editor.section.saving" },
  ],
  titleKey: "docs.editor.title",
} as const satisfies HelpArticleDefinition;

export const generateMetadata = () => createHelpArticleMetadata(definition);

export default function EditorHelpPage() {
  return renderHelpArticle(definition);
}
