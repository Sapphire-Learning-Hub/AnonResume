import { Mark, mergeAttributes } from "@tiptap/core";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const ResumeTextColorMark = Mark.create({
  name: "textColor",
  inclusive: true,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => {
          const color = element.getAttribute("data-resume-text-color") ?? "";

          return HEX_COLOR_PATTERN.test(color) ? color : null;
        },
        renderHTML: (attributes) => {
          const color =
            typeof attributes.color === "string" ? attributes.color : "";

          return HEX_COLOR_PATTERN.test(color)
            ? {
                "data-resume-text-color": color,
                style: `color: ${color}`,
              }
            : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-resume-text-color]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});
