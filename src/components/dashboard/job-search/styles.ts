import { createStyles } from "antd-style";
export const useJobSearchStyles = createStyles(({ css, token }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  `,
  toolbar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  `,
  heading: css`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: ${token.colorText};
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 16px;
  `,
  filters: css`
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  `,
  search: css`
    && {
      width: min(320px, 100%);
    }
  `,
  picker: css`
    && {
      min-width: 180px;
      max-width: 100%;
    }
  `,
  stack: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  `,
  prose: css`
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: ${token.colorText};
    margin: 0;
  `,
  muted: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  record: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    min-width: 0;
  `,
  recordButton: css`
    && {
      white-space: normal;
      text-align: start;
      height: auto;
      padding: 0;
      justify-content: flex-start;
    }
  `,
  details: css`
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 10px;
  `,
  label: css`
    color: ${token.colorTextSecondary};
    margin: 0;
  `,
  value: css`
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  `,
  empty: css`
    padding: 28px 8px;
  `,
  board: css`
    display: flex;
    gap: 14px;
    overflow-x: auto;
    padding: 2px 2px 14px;
    min-height: 360px;
  `,
  column: css`
    flex: 0 0 265px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: ${token.colorFillQuaternary};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    &[data-over="true"] {
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimaryBg};
    }
  `,
  columnHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 600;
  `,
  card: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: ${token.colorBgContainer};
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    &[data-dragging="true"] {
      opacity: 0.45;
    }
  `,
  drag: css`
    && {
      cursor: grab;
      touch-action: none;
    }
  `,
  cardTop: css`
    display: flex;
    gap: 6px;
    align-items: flex-start;
    justify-content: space-between;
  `,
  cardTitle: css`
    && {
      white-space: normal;
      overflow-wrap: anywhere;
      text-align: start;
      height: auto;
      padding: 0;
      justify-content: flex-start;
      font-weight: 600;
    }
  `,
  full: css`
    && {
      width: 100%;
    }
  `,
  note: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  stage: css`
    && {
      min-width: 130px;
    }
  `,
  mobileOnly: css`
    display: none;
    @media (max-width: 720px) {
      display: block;
    }
  `,
  mobile: css`
    && {
      @media (max-width: 720px) {
        display: none;
      }
    }
  `,
}));
