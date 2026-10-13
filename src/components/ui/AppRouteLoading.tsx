"use client";

import { LoadingOutlined } from "@ant-design/icons";
import { createStyles } from "antd-style";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import { useI18n } from "@/i18n/I18nProvider";

interface AppRouteLoadingContextValue {
  beginBoundary: () => void;
  endBoundary: () => void;
}

const AppRouteLoadingContext = createContext<AppRouteLoadingContextValue>({
  beginBoundary: () => {},
  endBoundary: () => {},
});

const ROUTE_LOADING_BOUNDARY_SELECTOR = "[data-app-route-loading-boundary]";

const useStyles = createStyles(({ token, css }) => ({
  indicator: css`
    position: fixed;
    inset: 0 0 auto;
    z-index: ${token.zIndexPopupBase + 20};
    pointer-events: none;
    opacity: 0;
    transition: opacity 180ms ${token.motionEaseInOut};

    &[data-active="true"] {
      opacity: 1;
    }

    body:has([data-app-route-loading-boundary]) & {
      opacity: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      transition-duration: 1ms;
    }
  `,
  progress: css`
    position: fixed;
    inset: 0 0 auto;
    height: 3px;
    overflow: hidden;
    background: ${token.colorPrimaryBg};

    &::after {
      position: absolute;
      inset: 0 auto 0 -38%;
      width: 38%;
      border-radius: 999px;
      background: linear-gradient(
        90deg,
        transparent,
        ${token.colorPrimary},
        ${token.colorPrimaryActive}
      );
      content: "";
      animation: app-route-progress 1.05s ${token.motionEaseInOut} infinite;
    }

    @keyframes app-route-progress {
      from {
        transform: translateX(0);
      }

      to {
        transform: translateX(365%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &::after {
        inset-inline: 0;
        width: 100%;
        animation: none;
      }
    }
  `,
  spinner: css`
    position: fixed;
    top: 14px;
    right: 16px;
    display: inline-flex;
    color: ${token.colorPrimary};
    filter:
      drop-shadow(0 0 2px ${token.colorBgBase})
      drop-shadow(0 2px 4px ${token.colorTextQuaternary});
    font-size: 28px;
    line-height: 1;

    @media (max-width: 720px) {
      top: 12px;
      right: 12px;
    }
  `,
  spinnerGlyph: css`
    animation: app-route-spinner 800ms linear infinite;

    @keyframes app-route-spinner {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `,
  assistiveText: css`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `,
}));

function isInternalRouteNavigation(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) {
    return false;
  }

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) {
    return false;
  }

  const current = new URL(window.location.href);
  return (
    destination.pathname !== current.pathname ||
    destination.search !== current.search
  );
}

export function AppRouteLoadingProvider({ children }: PropsWithChildren) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [boundaryCount, setBoundaryCount] = useState(0);
  const [linkPendingFrom, setLinkPendingFrom] = useState<string | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const active = boundaryCount > 0 || linkPendingFrom !== null;
  const label = t("common.pageLoading");

  const beginBoundary = useCallback(() => {
    setBoundaryCount((count) => count + 1);
  }, []);
  const endBoundary = useCallback(() => {
    setBoundaryCount((count) => Math.max(0, count - 1));
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (isInternalRouteNavigation(event)) setLinkPendingFrom(routeKey);
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [routeKey]);

  useEffect(() => {
    if (linkPendingFrom === null || linkPendingFrom === routeKey) return;

    function finishWhenFallbackClears() {
      if (document.querySelector(ROUTE_LOADING_BOUNDARY_SELECTOR)) return;

      setLinkPendingFrom(null);
    }

    const observer = new MutationObserver(finishWhenFallbackClears);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = window.requestAnimationFrame(finishWhenFallbackClears);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [linkPendingFrom, routeKey]);

  return (
    <AppRouteLoadingContext.Provider value={{ beginBoundary, endBoundary }}>
      {children}
      <div
        aria-busy={active}
        aria-hidden={!active}
        aria-label={label}
        className={styles.indicator}
        data-active={active}
        data-app-route-loading="true"
        role="status"
      >
        <span
          aria-label={label}
          className={styles.progress}
          role="progressbar"
        />
        <span aria-hidden="true" className={styles.spinner}>
          <LoadingOutlined className={styles.spinnerGlyph} />
        </span>
        <span className={styles.assistiveText}>{label}</span>
      </div>
    </AppRouteLoadingContext.Provider>
  );
}

export function AppRouteLoadingBoundary() {
  return (
    <>
      <span aria-hidden="true" data-app-route-loading-boundary hidden />
      <AppRouteLoadingHold active />
    </>
  );
}

export function AppRouteLoadingHold({ active }: { active: boolean }) {
  const { beginBoundary, endBoundary } = useContext(AppRouteLoadingContext);

  useLayoutEffect(() => {
    if (!active) return;

    beginBoundary();
    return endBoundary;
  }, [active, beginBoundary, endBoundary]);

  return null;
}
