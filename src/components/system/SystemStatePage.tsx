import type { ReactNode } from "react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";

interface SystemStatePageProps {
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
  code: string;
  description: string;
  onAction?: () => void;
  title: string;
}

export function SystemStatePage({
  actionHref,
  actionLabel,
  children,
  code,
  description,
  onAction,
  title,
}: SystemStatePageProps) {
  return (
    <main className="system-state-shell">
      <section className="system-state-card">
        <AnonResumeLogo
          className="system-state-logo"
          loading="eager"
          variant="lockup"
        />
        <div className="system-state-content">
          <p aria-hidden="true" className="system-state-code">
            {code}
          </p>
          <h1 className="system-state-title">{title}</h1>
          <p className="system-state-description">{description}</p>
          {children}
          {actionLabel && onAction ? (
            <button
              className="system-state-action"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          ) : null}
          {actionLabel && actionHref ? (
            <a className="system-state-action" href={actionHref}>
              {actionLabel}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
