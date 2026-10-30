"use client";

import type { ReactNode } from "react";
import { createStyles } from "antd-style";

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: ${token.marginXXS}px ${token.marginXS}px;
    min-width: 0;
    max-width: 100%;
    vertical-align: baseline;
    overflow-wrap: anywhere;
    &[data-stacked="true"] {
      flex-direction: column;
      gap: 0;
    }
  `,
}));

export function InlineMetadata({
  children,
  stacked = false,
}: {
  children: ReactNode;
  stacked?: boolean;
}) {
  const { styles } = useStyles();
  return (
    <span className={styles.root} data-stacked={stacked}>
      {children}
    </span>
  );
}
