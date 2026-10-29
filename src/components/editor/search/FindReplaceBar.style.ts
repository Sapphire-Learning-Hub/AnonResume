import { createStyles } from "antd-style";

export const useFindReplaceBarStyles = createStyles(({ css, token }) => ({
  root: css`
    position: absolute;
    z-index: 12;
    top: 42px;
    right: 16px;
    width: min(480px, calc(100% - 32px));
    padding: 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
    color: ${token.colorText};
  `,
  heading: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  row: css`
    display: flex;
    align-items: center;
    gap: 6px;
    &[data-replacement="true"] {
      margin-top: 8px;
    }
  `,
  input: css`
    && {
      flex: 1;
      min-width: 72px;
    }
  `,
  icon: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 26px;
      min-width: 26px;
      padding: 0;
    }
  `,
  counter: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${token.colorTextSecondary};
    font-variant-numeric: tabular-nums;
  `,
  case: css`
    && {
      flex-shrink: 0;
      margin: 0;
    }
  `,
}));
