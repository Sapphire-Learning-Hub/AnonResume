"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export function AiMarkdownMessage({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a {...props} rel="noreferrer noopener" target="_blank">
            {linkChildren}
          </a>
        ),
        img: () => null,
      }}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      skipHtml
    >
      {children}
    </ReactMarkdown>
  );
}
