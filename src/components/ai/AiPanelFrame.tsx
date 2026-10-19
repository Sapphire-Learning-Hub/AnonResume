"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { CloseIcon } from "@/components/ui/InlineIcons";
import { useAiAssistantPanelStyles } from "./AiAssistantPanel.style";

const MIN_WIDTH = 360;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 480;

function maximumWidth() { return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 640)); }

export function AiPanelFrame({ title, onClose, children, open = true }: { title: string; onClose: () => void; children: ReactNode; open?: boolean }) {
  const { styles } = useAiAssistantPanelStyles();
  const { t } = useI18n();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const drag = useRef<{ pointerId: number; width: number; x: number } | null>(null);
  function resize(next: number) { setWidth(Math.max(MIN_WIDTH, Math.min(next, maximumWidth()))); }
  useEffect(() => {
    if (!open) return;
    const constrain = () => setWidth((current) => Math.max(MIN_WIDTH, Math.min(current, maximumWidth())));
    constrain();
    window.addEventListener("resize", constrain);
    return () => window.removeEventListener("resize", constrain);
  }, [open]);
  if (!open) return null;
  return <aside aria-label={title} className={styles.panel} style={{ width }}>
    <div className={styles.resizeHandle} role="separator" aria-label={t("ai.resize")} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} tabIndex={0}
      onDoubleClick={() => resize(DEFAULT_WIDTH)}
      onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resize(width + (event.key === "ArrowLeft" ? 24 : -24)); } }}
      onPointerDown={(event) => { drag.current = { pointerId: event.pointerId, width, x: event.clientX }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onPointerMove={(event) => { if (drag.current?.pointerId === event.pointerId) resize(drag.current.width + drag.current.x - event.clientX); }}
      onPointerUp={(event) => { drag.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} />
    <header className={styles.header}>
      <div className={styles.title}><span className={styles.titleMark}>AI</span><strong>{title}</strong></div>
      <Button type="text" className={styles.closeButton} aria-label={t("common.dismiss")} onClick={onClose}><CloseIcon size={17} /></Button>
    </header>
    {children}
  </aside>;
}
