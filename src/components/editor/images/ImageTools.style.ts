import { createStyles } from "antd-style";

export const useImageToolsStyles = createStyles(({ css, token }) => ({
  stack: css`
    display: grid;
    gap: 6px;
  `,
  row: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  label: css`
    flex: 0 0 auto;
    color: ${token.colorTextSecondary};
    font-size: ${token.fontSizeSM}px;
  `,
  number: css`
    && {
      width: 82px;
    }
  `,
  select: css`
    && {
      width: 118px;
    }
  `,
  description: css`
    && {
      width: 220px;
    }
  `,
}));
