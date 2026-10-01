"use client";

import { useEffect, useState } from "react";

function escapeAttributeValue(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function findOnboardingAnchor(anchorId: string) {
  return document.querySelector<HTMLElement>(
    `[data-onboarding-anchor="${escapeAttributeValue(anchorId)}"]`,
  );
}

function sameRect(left: DOMRectReadOnly | null, right: DOMRectReadOnly | null) {
  if (!left || !right) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function useOnboardingAnchor(anchorId: string, revision = 0) {
  const [rect, setRect] = useState<DOMRectReadOnly | null>(null);

  useEffect(() => {
    let frame = 0;
    let observedTarget: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => scheduleMeasure());

    function measure() {
      frame = 0;
      const target = findOnboardingAnchor(anchorId);
      if (target !== observedTarget) {
        resizeObserver.disconnect();
        observedTarget = target;
        if (target) resizeObserver.observe(target);
      }
      const nextRect = target?.getBoundingClientRect() ?? null;
      setRect((current) => (sameRect(current, nextRect) ? current : nextRect));
    }

    function scheduleMeasure() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    measure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [anchorId, revision]);

  return rect;
}
