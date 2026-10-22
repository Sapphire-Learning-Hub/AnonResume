import { createStyles } from "antd-style";

export const useTemplateStyles = createStyles(({ token, css }) => ({
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(226px, 1fr));
    gap: 18px;
  `,
  card: css`
    min-width: 0;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    overflow: hidden;
    background: ${token.colorBgContainer};
  `,
  thumbnail: css`
    position: relative;
    height: 250px;
    overflow: hidden;
    background: ${token.colorFillQuaternary};
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  document: css`
    position: absolute;
    top: 12px;
    left: 50%;
    width: 210mm;
    margin-left: -105mm;
    transform: scale(0.245);
    transform-origin: top center;
    pointer-events: none;
  `,
  meta: css`
    display: grid;
    gap: 12px;
    padding: 16px;
  `,
  name: css`
    font-weight: 600;
    overflow-wrap: anywhere;
  `,
  date: css`
    color: ${token.colorTextSecondary};
    font-size: ${token.fontSizeSM}px;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
  `,
  more: css`
    display: flex;
    justify-content: center;
    padding-top: 20px;
  `,
  stage: css`
    background: ${token.colorFillSecondary};
    overflow: auto;
    padding: 20px;
    max-height: 70vh;
    &[data-style-scope="template-preview"] [data-print-chrome="screen"] {
      display: none;
    }
  `,
  form: css`
    display: grid;
    gap: 20px;
    padding-top: 12px;
  `,
  field: css`
    display: grid;
    gap: 8px;
  `,
  control: css`
    && {
      width: 100%;
    }
  `,
}));
