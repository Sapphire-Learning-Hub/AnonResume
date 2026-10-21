import { createStyles } from "antd-style";

export const useStyles = createStyles(({ css, token }) => ({
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 64px;
  `,
  title: css`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: ${token.colorText};
  `,
  content: css`
    display: grid;
    gap: 16px;
    min-width: 0;
  `,
  search: css`
    && {
      max-width: 360px;
    }
  `,
  actions: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  `,
  footer: css`
    display: flex;
    justify-content: flex-end;
  `,
}));
