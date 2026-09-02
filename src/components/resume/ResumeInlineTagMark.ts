import { Mark, mergeAttributes } from "@tiptap/core";

export const ResumeInlineTagMark = Mark.create({
  name: "tag",
  priority: 1100,
  inclusive: false,

  parseHTML() {
    return [{ tag: 'span[data-resume-inline-tag="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-resume-inline-tag": "true",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-e": () => this.editor.commands.toggleMark(this.name),
    };
  },
});
