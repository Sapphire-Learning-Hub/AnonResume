import { createStyles } from "antd-style";

export const useCanvasSearchHighlightStyles = createStyles(
  ({ css, token }) => ({
    layer: css`
      position: absolute;
      z-index: 7;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    `,
    match: css`
      position: absolute;
      pointer-events: none;
      background: ${token.colorWarningBg};
      opacity: 0.45;
      border-radius: 2px;
      &[data-current="true"] {
        background: ${token.colorWarning};
        outline: 1px solid ${token.colorWarningActive};
        opacity: 0.6;
      }
    `,
  }),
);
