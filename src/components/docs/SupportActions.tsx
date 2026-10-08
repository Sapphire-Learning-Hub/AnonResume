"use client";

import { ExportOutlined } from "@ant-design/icons";
import Link from "next/link";

import type { PublicDestination } from "@/lib/public-info/destinations";

import { useSupportActionsStyles } from "./SupportActions.style";

export interface SupportActionsLabels {
  contactAdministrator: string;
  openSupport: string;
  troubleshooting: string;
}

export function SupportActions({
  destination,
  labels,
}: {
  destination: PublicDestination;
  labels: SupportActionsLabels;
}) {
  const { styles } = useSupportActionsStyles();

  return (
    <section className={styles.actions}>
      {!destination.external ? (
        <p className={styles.notice}>{labels.contactAdministrator}</p>
      ) : null}
      <div className={styles.links}>
        <Link href="/docs/troubleshooting">{labels.troubleshooting}</Link>
        {destination.external ? (
          <a
            data-primary="true"
            href={destination.href}
            rel="noreferrer"
            target="_blank"
          >
            {labels.openSupport}
            <ExportOutlined aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
