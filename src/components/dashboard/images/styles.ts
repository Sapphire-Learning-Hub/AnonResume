import { createStyles } from "antd-style";
export const useImageLibraryStyles = createStyles(({ css, token }) => ({
  root: css`
    display: grid;
    gap: 20px;
    min-width: 0;
  `,
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  search: css`
    && {
      width: min(320px, 100%);
    }
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  `,
  card: css`
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    min-width: 0;
  `,
  preview: css`
    height: 180px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: ${token.colorFillQuaternary};
    border-radius: ${token.borderRadius}px;
  `,
  name: css`
    && {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin: 0;
    }
  `,
  actions: css`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
  `,
  hint: css`
    color: ${token.colorTextSecondary};
    font-size: ${token.fontSizeSM}px;
  `,
  progress: css`
    display: grid;
    gap: 8px;
  `,
}));
