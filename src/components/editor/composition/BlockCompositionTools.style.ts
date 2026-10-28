import { createStyles } from "antd-style";

export const useBlockCompositionStyles = createStyles(({ css }) => ({
  button: css`
    && {
      height: 30px;
      padding: 0 8px;
      border: 0;
      border-radius: 6px;
      box-shadow: none;
      background: transparent;
      font-size: 12px;
    }
  `,
}));
