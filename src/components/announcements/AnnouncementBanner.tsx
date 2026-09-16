"use client";

import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Alert, Button } from "antd";
import { createStyles } from "antd-style";
import { useLayoutEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/I18nProvider";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const useStyles = createStyles(({ token, css }) => ({
  root: css`
    && {
      width: 100%;
      min-height: 52px;
      padding: 9px 14px;
      border-radius: 10px;
    }

    && .ant-alert-content,
    && .ant-alert-message {
      min-width: 0;
      width: 100%;
    }

    && .ant-alert-icon {
      align-self: center;
    }

    &[data-variant="header"] {
      min-height: 36px;
      padding: 3px 8px;
      border-color: ${token.colorBorderSecondary};
      background: color-mix(
        in srgb,
        ${token.colorBgContainer} 64%,
        ${token.colorFillTertiary}
      );
    }

    &[data-variant="header"] .ant-alert-icon {
      margin-inline-end: 7px;
      font-size: 14px;
    }
  `,
  content: css`
    display: flex;
    align-items: baseline;
    min-width: 0;
    gap: 10px;

    @media (max-width: 640px) {
      display: grid;
      gap: 2px;
    }

    [data-variant="header"] & {
      flex: none;
      width: max-content;
      gap: 7px;
      white-space: nowrap;
    }
  `,
  messageViewport: css`
    min-width: 0;
    width: 100%;
    overflow: hidden;
  `,
  messageTrack: css`
    display: flex;
    width: max-content;

    &[data-scrolling="true"] {
      animation: announcement-scroll 20s linear infinite;
    }

    &[data-scrolling="true"]:hover {
      animation-play-state: paused;
    }

    &[data-scrolling="true"]:focus-within {
      animation-play-state: paused;
    }

    @keyframes announcement-scroll {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(-50%);
      }
    }
  `,
  messageSegment: css`
    display: flex;
    flex: none;
    padding-inline-end: 48px;
  `,
  title: css`
    flex: 0 0 auto;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.55;

    [data-variant="header"] & {
      font-size: 13px;
      line-height: 1.4;
    }
  `,
  body: css`
    min-width: 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.55;

    [data-variant="header"] & {
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
    }

    @media (max-width: 980px) {
      [data-variant="header"] & {
        display: none;
      }
    }
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: 2px;

    [data-variant="header"] & {
      margin-inline-start: 6px;
    }
  `,
  position: css`
    min-width: 34px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  `,
  actionButton: css`
    && {
      color: ${token.colorTextSecondary};

      &:hover {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }
    }
  `,
}));

export function AnnouncementBanner({
  announcements,
  variant = "default",
}: {
  announcements: readonly LocalizedAnnouncement[];
  variant?: "default" | "header";
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [headerTextOverflows, setHeaderTextOverflows] = useState(false);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const messageSegmentRef = useRef<HTMLDivElement>(null);
  const visibleAnnouncements = announcements.filter(
    (announcement) => !dismissedIds.has(announcement.id),
  );
  const effectiveIndex = Math.min(
    currentIndex,
    visibleAnnouncements.length - 1,
  );
  const announcement = visibleAnnouncements[effectiveIndex];
  const hasMultiple = visibleAnnouncements.length > 1;

  useLayoutEffect(() => {
    if (variant !== "header" || !announcement) {
      return;
    }

    const viewport = messageViewportRef.current;
    const segment = messageSegmentRef.current;
    if (!viewport || !segment) {
      return;
    }

    const updateOverflow = () => {
      setHeaderTextOverflows(segment.scrollWidth > viewport.clientWidth);
    };
    const frame = window.requestAnimationFrame(updateOverflow);

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(viewport);
    observer.observe(segment);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [announcement, variant]);

  if (!announcement) {
    return null;
  }

  const alertType = announcement.tone === "critical"
    ? "error"
    : announcement.tone;

  return (
    <Alert
      aria-label={t("announcements.region")}
      aria-live="polite"
      className={styles.root}
      data-variant={variant}
      message={
        <div className={styles.messageViewport} ref={messageViewportRef}>
          <div
            className={styles.messageTrack}
            data-scrolling={headerTextOverflows}
          >
            <div className={styles.messageSegment} ref={messageSegmentRef}>
              <div className={styles.content}>
                <span className={styles.title}>{announcement.title}</span>
                <span className={styles.body}>{announcement.body}</span>
              </div>
            </div>
            {headerTextOverflows ? (
              <div aria-hidden="true" className={styles.messageSegment}>
                <div className={styles.content}>
                  <span className={styles.title}>{announcement.title}</span>
                  <span className={styles.body}>{announcement.body}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      }
      role={announcement.tone === "critical" ? "alert" : "status"}
      showIcon
      type={alertType}
      action={
        <div className={styles.actions}>
          {hasMultiple ? (
            <>
              <Button
                aria-label={t("announcements.previous")}
                className={styles.actionButton}
                icon={<LeftOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  setCurrentIndex(
                    (effectiveIndex - 1 + visibleAnnouncements.length) %
                      visibleAnnouncements.length,
                  )
                }
              />
              <span className={styles.position}>
                {effectiveIndex + 1}/{visibleAnnouncements.length}
              </span>
              <Button
                aria-label={t("announcements.next")}
                className={styles.actionButton}
                icon={<RightOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  setCurrentIndex(
                    () => (effectiveIndex + 1) % visibleAnnouncements.length,
                  )
                }
              />
            </>
          ) : null}
          {announcement.dismissible ? (
            <Button
              aria-label={t("announcements.dismiss")}
              className={styles.actionButton}
              icon={<CloseOutlined />}
              size="small"
              type="text"
              onClick={() => {
                setDismissedIds((ids) => new Set(ids).add(announcement.id));
                setCurrentIndex(0);
              }}
            />
          ) : null}
        </div>
      }
    />
  );
}
