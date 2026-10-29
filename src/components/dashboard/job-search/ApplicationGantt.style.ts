import { createStyles } from "antd-style";
export const GANTT_TRACK_MIN_WIDTH = 760;
export const GANTT_MILESTONE_LABEL_WIDTH = 180;
export const useApplicationGanttStyles = createStyles(({ css, token }) => ({
  scroll: css`
    overflow: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    min-width: 0;
  `,
  table: css`
    min-width: 1000px;
  `,
  row: css`
    display: grid;
    grid-template-columns: 240px minmax(${GANTT_TRACK_MIN_WIDTH}px, 1fr);
    min-height: 80px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    &:last-child {
      border-bottom: 0;
    }
  `,
  header: css`
    display: grid;
    grid-template-columns: 240px minmax(${GANTT_TRACK_MIN_WIDTH}px, 1fr);
    height: 52px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
  `,
  label: css`
    position: sticky;
    left: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 10px 14px;
    background: ${token.colorBgContainer};
    border-right: 1px solid ${token.colorBorderSecondary};
    min-width: 0;
  `,
  title: css`
    && {
      height: auto;
      white-space: normal;
      overflow-wrap: anywhere;
      text-align: start;
      padding: 0;
      justify-content: flex-start;
    }
  `,
  muted: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  track: css`
    position: relative;
    min-height: 84px;
    overflow: hidden;
    background-image: linear-gradient(
      to right,
      ${token.colorBorderSecondary} 1px,
      transparent 1px
    );
    background-size: 20% 100%;
  `,
  axis: css`
    position: relative;
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  bar: css`
    position: absolute;
    top: 16px;
    height: 28px;
    min-width: 10px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: ${token.borderRadiusSM}px;
    padding: 0 8px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimaryText};
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: start;
    font: inherit;
    &[data-stage="offered"] {
      color: ${token.colorSuccessText};
      background: ${token.colorSuccessBg};
      border-color: ${token.colorSuccessBorder};
    }
    &[data-stage="rejected"] {
      color: ${token.colorErrorText};
      background: ${token.colorErrorBg};
      border-color: ${token.colorErrorBorder};
    }
    &[data-stage="withdrawn"] {
      color: ${token.colorTextSecondary};
      background: ${token.colorFillSecondary};
      border-color: ${token.colorBorder};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
  `,
  timeControls: css`
    display: flex;
    gap: 6px;
    align-items: center;
  `,
  axisTick: css`
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    &[data-edge="start"] {
      transform: translateY(-50%);
    }
    &[data-edge="end"] {
      transform: translate(-100%, -50%);
    }
  `,
  milestoneLayer: css`
    position: absolute;
    inset: 0;
    pointer-events: none;
    font-size: 12px;
  `,
  milestonePoint: css`
    position: absolute;
    top: 16px;
    height: 28px;
    width: 0;
  `,
  milestoneName: css`
    position: absolute;
    top: 0;
    left: 0;
    max-width: ${GANTT_MILESTONE_LABEL_WIDTH}px;
    box-sizing: border-box;
    height: 28px;
    padding: 0 4px;
    font: inherit;
    line-height: 26px;
    color: ${token.colorPrimaryText};
    background: transparent;
    border: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    pointer-events: auto;
    &[data-status="offered"] {
      color: ${token.colorSuccessText};
    }
    &[data-status="rejected"] {
      color: ${token.colorErrorText};
    }
    &[data-status="withdrawn"] {
      color: ${token.colorTextSecondary};
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
  `,
  milestoneDetail: css`
    display: flex;
    gap: 8px;
    justify-content: space-between;
    white-space: nowrap;
  `,
  olderMilestones: css`
    && {
      position: absolute;
      left: 12px;
      bottom: 4px;
      pointer-events: auto;
    }
  `,
  today: css`
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px dashed ${token.colorPrimary};
    pointer-events: none;
    z-index: 1;
  `,
}));
