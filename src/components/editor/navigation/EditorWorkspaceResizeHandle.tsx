"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { useEditorWorkspaceResizeHandleStyles } from "./EditorWorkspaceResizeHandle.style";

const KEYBOARD_RESIZE_STEP = 16;

function clampWidth(width: number, min: number, max: number) {
  return Math.min(max, Math.max(min, width));
}

export function EditorWorkspaceResizeHandle({
  label,
  max,
  min,
  value,
  onChange,
}: {
  label: string;
  max: number;
  min: number;
  value: number;
  onChange: (width: number) => void;
}) {
  const { styles } = useEditorWorkspaceResizeHandleStyles();
  const dragRef = useRef<
    | {
        pointerId: number;
        startWidth: number;
        startX: number;
      }
    | undefined
  >(undefined);
  const [resizing, setResizing] = useState(false);

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = undefined;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | undefined;

    if (event.key === "ArrowLeft") {
      nextWidth = value - KEYBOARD_RESIZE_STEP;
    } else if (event.key === "ArrowRight") {
      nextWidth = value + KEYBOARD_RESIZE_STEP;
    } else if (event.key === "Home") {
      nextWidth = min;
    } else if (event.key === "End") {
      nextWidth = max;
    }

    if (nextWidth === undefined) return;

    event.preventDefault();
    onChange(clampWidth(nextWidth, min, max));
  }

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={styles.handle}
      data-resizing={resizing}
      role="separator"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={() => {
        dragRef.current = undefined;
        setResizing(false);
      }}
      onPointerDown={(event) => {
        dragRef.current = {
          pointerId: event.pointerId,
          startWidth: value,
          startX: event.clientX,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        onChange(
          clampWidth(
            drag.startWidth + event.clientX - drag.startX,
            min,
            max,
          ),
        );
      }}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
    />
  );
}
