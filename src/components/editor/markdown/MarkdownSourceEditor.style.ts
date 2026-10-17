import { createStyles } from "antd-style";

export const useMarkdownSourceEditorStyles = createStyles(({ css, token }) => ({
  root: css`
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-top: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};

    > .cm-editor {
      height: 100%;
      color: ${token.colorText};
      background: transparent;
      font-family: var(--font-jetbrains-mono), monospace;
      font-size: 13px;
    }

    > .cm-editor.cm-focused {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: -2px;
    }

    > .cm-editor > .cm-scroller {
      overflow: auto;
    }

    > .cm-editor .cm-gutters {
      color: ${token.colorTextTertiary};
      background: ${token.colorFillQuaternary};
      border-right-color: ${token.colorBorderSecondary};
    }

    > .cm-editor .cm-activeLine,
    > .cm-editor .cm-activeLineGutter {
      background: ${token.colorFillQuaternary};
    }
  `,
}));
