"use client";

import { createStyles } from "antd-style";

import { getResumeIcon } from "@/domain/resume/icon-catalog";

const useResumeInlineIconStyles = createStyles(({ css }) => ({
  root: css`
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    margin: 0;
    padding: 0;
    color: inherit;
    line-height: 1;
    vertical-align: -0.125em;
    flex: 0 0 auto;

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `,
  missing: css`
    opacity: 0.26;
    outline: 1px dashed currentColor;
    outline-offset: -1px;
  `,
}));

interface ResumeInlineIconProps {
  iconId: string;
  includeDataAttribute?: boolean;
}

export function ResumeInlineIcon({
  iconId,
  includeDataAttribute = true,
}: ResumeInlineIconProps) {
  const { styles, cx } = useResumeInlineIconStyles();
  const icon = getResumeIcon(iconId);

  if (!icon) {
    return (
      <span
        aria-hidden="true"
        className={cx(styles.root, styles.missing)}
        data-resume-icon-id={includeDataAttribute ? iconId : undefined}
        data-resume-icon-missing="true"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={styles.root}
      data-resume-icon-id={includeDataAttribute ? iconId : undefined}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${icon.svg.width} ${icon.svg.height}`}
        xmlns="http://www.w3.org/2000/svg"
        dangerouslySetInnerHTML={{ __html: icon.svg.body }}
      />
    </span>
  );
}
