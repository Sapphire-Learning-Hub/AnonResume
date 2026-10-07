import { createStyles } from "antd-style";

export const useAccountCenterStyles = createStyles(({ token, css }) => ({
  page: css`
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: 32px clamp(20px, 4vw, 48px) 64px;
  `,
  header: css`
    display: grid;
    gap: 8px;
    margin-bottom: 24px;
  `,
  title: css`
    margin: 0;
    color: ${token.colorText};
    font-size: clamp(28px, 4vw, 40px);
    line-height: 1.15;
  `,
  lead: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 15px;
  `,
  loading: css`
    display: grid;
    min-height: 320px;
    place-items: center;
  `,
  sections: css`
    display: grid;
    gap: 18px;
  `,
  section: css`
    display: grid;
    gap: 20px;
    padding: clamp(20px, 3vw, 30px);
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 18px;
    background: ${token.colorBgContainer};
  `,
  sectionHeader: css`
    display: grid;
    gap: 5px;
  `,
  sectionTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
  `,
  sectionDescription: css`
    margin: 0;
    color: ${token.colorTextSecondary};
  `,
  split: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    @media (max-width: 860px) {
      grid-template-columns: 1fr;
    }
  `,
  panel: css`
    display: grid;
    align-content: start;
    gap: 14px;
    min-width: 0;
    padding: 18px;
    border-radius: 14px;
    background: ${token.colorFillQuaternary};
  `,
  panelTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 16px;
  `,
  field: css`
    display: grid;
    gap: 7px;
  `,
  label: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  actionRow: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  `,
  sessionList: css`
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  session: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 12px;

    @media (max-width: 620px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  sessionInfo: css`
    display: grid;
    min-width: 0;
    gap: 3px;
  `,
  sessionMeta: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  dataRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;

    @media (max-width: 620px) {
      grid-template-columns: 1fr;
    }
  `,
  danger: css`
    border-color: ${token.colorErrorBorder};
    background: ${token.colorErrorBg};
  `,
  muted: css`
    margin: 0;
    color: ${token.colorTextSecondary};
  `,
  modalBody: css`
    display: grid;
    gap: 16px;
  `,
}));
