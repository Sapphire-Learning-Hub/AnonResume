"use client";

import { Alert, Button } from "antd";
import { createStyles } from "antd-style";

import type { ManagedConfigurationHealthState } from "@/lib/config/health";

const useStyles = createStyles(({ css }) => ({
  banner: css`
    && {
      margin: 20px 0 4px;
    }
  `,
}));

export function ConfigurationHealthBanner({
  description,
  health,
  title,
  action,
}: {
  action?: { href: string; label: string };
  description: string;
  health: ManagedConfigurationHealthState;
  title: string;
}) {
  const { styles } = useStyles();
  if (health === "healthy") return null;

  return (
    <Alert
      action={
        action ? (
          <Button href={action.href} size="small" type="link">
            {action.label}
          </Button>
        ) : undefined
      }
      className={styles.banner}
      description={description}
      message={title}
      role="status"
      showIcon
      type={health === "recovery_required" ? "error" : "warning"}
    />
  );
}
