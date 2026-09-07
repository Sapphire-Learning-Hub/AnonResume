"use client";

import { Button } from "antd";

import {
  ZoomInIcon,
  ZoomOutIcon,
  ZoomResetIcon,
} from "@/components/ui/InlineIcons";
import { useI18n } from "@/i18n/I18nProvider";

import { CanvasPageNavigation } from "./CanvasPageNavigation";
import { useEditorStatusBarStyles } from "./EditorStatusBar.style";

export function EditorStatusBar({
  canZoomIn,
  canZoomOut,
  currentPage,
  pageCount,
  statusBarLabel,
  zoomInLabel,
  zoomLabel,
  zoomOutLabel,
  zoomResetLabel,
  onPageChange,
  onResetZoom,
  onZoomIn,
  onZoomOut,
}: {
  canZoomIn: boolean;
  canZoomOut: boolean;
  currentPage: number;
  pageCount: number;
  statusBarLabel: string;
  zoomInLabel: string;
  zoomLabel: string;
  zoomOutLabel: string;
  zoomResetLabel: string;
  onPageChange: (page: number) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const { styles } = useEditorStatusBarStyles();
  const { t } = useI18n();

  return (
    <footer aria-label={statusBarLabel} className={styles.statusBar} role="region">
      <span className={styles.pageCount}>{t("editor.pageCount", { count: pageCount })}</span>
      <div className={styles.navigation}>
        {pageCount > 1 ? (
          <CanvasPageNavigation
            current={currentPage}
            pageCount={pageCount}
            onChange={onPageChange}
          />
        ) : null}
      </div>
      <div className={styles.zoomControls}>
        <Button
          aria-label={zoomOutLabel}
          className={styles.zoomButton}
          disabled={!canZoomOut}
          title={zoomOutLabel}
          onClick={onZoomOut}
        >
          <ZoomOutIcon size={15} />
        </Button>
        <Button
          aria-label={zoomResetLabel}
          className={styles.zoomButton}
          title={zoomResetLabel}
          onClick={onResetZoom}
        >
          <ZoomResetIcon size={15} />
        </Button>
        <span className={styles.zoomValue}>{zoomLabel}</span>
        <Button
          aria-label={zoomInLabel}
          className={styles.zoomButton}
          disabled={!canZoomIn}
          title={zoomInLabel}
          onClick={onZoomIn}
        >
          <ZoomInIcon size={15} />
        </Button>
      </div>
    </footer>
  );
}
