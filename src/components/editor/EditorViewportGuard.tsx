"use client";

import { useRouter } from "next/navigation";
import { type PropsWithChildren, useEffect, useSyncExternalStore } from "react";

export type EditorViewportAccess = "checking" | "allowed" | "blocked";

export const editorViewportMediaQuery = "(min-width: 961px)";

function subscribeToEditorViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(editorViewportMediaQuery);

  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getEditorViewportSnapshot(): EditorViewportAccess {
  if (typeof window === "undefined") {
    return "checking";
  }

  if (!window.matchMedia) {
    return "allowed";
  }

  return window.matchMedia(editorViewportMediaQuery).matches
    ? "allowed"
    : "blocked";
}

function getEditorViewportServerSnapshot(): EditorViewportAccess {
  return "checking";
}

export function useEditorViewportAccess() {
  return useSyncExternalStore(
    subscribeToEditorViewport,
    getEditorViewportSnapshot,
    getEditorViewportServerSnapshot,
  );
}

export function EditorViewportGuard({
  children,
  fallbackHref = "/app",
}: PropsWithChildren<{ fallbackHref?: string }>) {
  const router = useRouter();
  const access = useEditorViewportAccess();

  useEffect(() => {
    if (access === "blocked") {
      router.replace(fallbackHref);
    }
  }, [access, fallbackHref, router]);

  return access === "allowed" ? children : null;
}
