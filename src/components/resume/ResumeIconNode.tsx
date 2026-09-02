"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { createStyles } from "antd-style";

import { ResumeInlineIcon } from "./ResumeInlineIcon";

const useResumeIconNodeStyles = createStyles(({ css }) => ({
  root: css`
    display: inline;
    border-radius: 3px;

    &[data-selected="true"] {
      outline: 2px solid var(--app-accent);
      outline-offset: 2px;
    }
  `,
}));

function ResumeIconNodeView({ node, selected }: NodeViewProps) {
  const { styles } = useResumeIconNodeStyles();
  const iconId = typeof node.attrs.iconId === "string" ? node.attrs.iconId : "";

  return (
    <NodeViewWrapper
      as="span"
      className={styles.root}
      contentEditable={false}
      data-selected={selected ? "true" : "false"}
    >
      <ResumeInlineIcon iconId={iconId} includeDataAttribute={false} />
    </NodeViewWrapper>
  );
}

export const ResumeIconNode = Node.create({
  name: "resumeIcon",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      iconId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-resume-icon-id") ?? "",
        renderHTML: (attributes) => ({
          "data-resume-icon-id": attributes.iconId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-resume-icon-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-resume-inline-icon": "true",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResumeIconNodeView);
  },
});
