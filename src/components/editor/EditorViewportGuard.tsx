"use client";

import { useRouter } from "next/navigation";
import {
  type PropsWithChildren,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

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

function subscribeToEditorViewportSession() {
  return () => {};
}

function createEditorViewportSessionStore() {
  let access: EditorViewportAccess = "checking";

  return {
    getSnapshot() {
      if (access === "checking") {
        access = getEditorViewportSnapshot();
      }

      return access;
    },
  };
}

function useEditorViewportSessionAccess() {
  const [store] = useState(createEditorViewportSessionStore);

  return useSyncExternalStore(
    subscribeToEditorViewportSession,
    store.getSnapshot,
    getEditorViewportServerSnapshot,
  );
}

export function EditorViewportGuard({
  children,
  fallbackHref = "/app",
}: PropsWithChildren<{ fallbackHref?: string }>) {
  const router = useRouter();
  const sessionAccess = useEditorViewportSessionAccess();

  useEffect(() => {
    if (sessionAccess === "blocked") {
      router.replace(fallbackHref);
    }
  }, [fallbackHref, router, sessionAccess]);

  return sessionAccess === "allowed" ? children : null;
}
