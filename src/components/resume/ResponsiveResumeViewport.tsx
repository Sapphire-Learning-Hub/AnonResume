"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export function getResponsiveViewportMetrics(input: {
  containerWidth: number;
  contentWidth: number;
  contentHeight: number;
}) {
  if (
    input.containerWidth <= 0 ||
    input.contentWidth <= 0 ||
    input.contentHeight <= 0
  ) {
    return {
      scale: 1,
      width: 0,
      height: 0,
    };
  }

  const scale = Math.min(1, input.containerWidth / input.contentWidth);
  const roundedScale = Number(scale.toFixed(4));

  return {
    scale: roundedScale,
    width: Math.ceil(input.contentWidth * roundedScale),
    height: Math.ceil(input.contentHeight * roundedScale),
  };
}

export function ResponsiveResumeViewport({
  children,
  reflowAt = 0,
}: {
  children: ReactNode;
  reflowAt?: number;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({
    containerWidth: 0,
    scale: 1,
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    const contentElement = contentRef.current;

    if (!viewportElement || !contentElement) {
      return;
    }

    const measure = () => {
      const nextMetrics = getResponsiveViewportMetrics({
        containerWidth: viewportElement.clientWidth,
        contentWidth: contentElement.scrollWidth,
        contentHeight: contentElement.scrollHeight,
      });

      const nextMetricsWithContainer = {
        ...nextMetrics,
        containerWidth: viewportElement.clientWidth,
      };

      setMetrics((current) =>
        current.containerWidth === nextMetricsWithContainer.containerWidth
          && current.scale === nextMetricsWithContainer.scale
          && current.height === nextMetricsWithContainer.height
          && current.width === nextMetricsWithContainer.width
          ? current
          : nextMetricsWithContainer,
      );
    };

    measure();
    const frameId = window.requestAnimationFrame(() => {
      measure();
    });
    const postPaintFrameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        measure();
      });
    });
    const fontsReadyPromise = document.fonts?.ready?.then(() => {
      measure();
    });

    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            measure();
          });

    observer?.observe(viewportElement);
    observer?.observe(contentElement);
    window.addEventListener("resize", measure);

    return () => {
      void fontsReadyPromise;
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(postPaintFrameId);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const usesMobileReflow =
    reflowAt > 0 && metrics.containerWidth > 0 && metrics.containerWidth <= reflowAt;

  const viewportStyle: CSSProperties = {
    width: "100%",
    overflowX: "hidden",
  };
  const slotStyle: CSSProperties = {
    position: "relative",
    width: usesMobileReflow ? "100%" : metrics.width || undefined,
    height: usesMobileReflow ? "auto" : metrics.height || undefined,
    margin: "0 auto",
  };
  const contentStyle: CSSProperties = {
    position: usesMobileReflow ? "relative" : "absolute",
    top: usesMobileReflow ? undefined : 0,
    left: usesMobileReflow ? undefined : 0,
    width: usesMobileReflow ? "100%" : "max-content",
    transform: usesMobileReflow ? "none" : `scale(${metrics.scale})`,
    transformOrigin: usesMobileReflow ? undefined : "top left",
  };

  return (
    <div
      ref={viewportRef}
      style={viewportStyle}
      data-testid="responsive-resume-viewport"
    >
      <div style={slotStyle} data-testid="responsive-resume-slot">
        <div
          ref={contentRef}
          style={contentStyle}
          data-testid="responsive-resume-content"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
