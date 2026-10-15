"use client";

import { useEffect, useState } from "react";

import type { ResumeFontAssetKey } from "@/domain/resume/font-presets";

export type ResumeFontAssetStatus = "idle" | "loading" | "ready" | "error";

const loaders = {
  "latin-sans": () => import("./assets/LatinSansAssets"),
  "latin-serif": () => import("./assets/LatinSerifAssets"),
  "mono": () => import("./assets/MonoAssets"),
  "cjk-sans": () => import("./assets/CjkSansAssets"),
  "cjk-serif-display": () => import("./assets/CjkSerifAndDisplayAssets"),
} satisfies Record<ResumeFontAssetKey, () => Promise<{ default: React.ComponentType }>>;

const statuses = new Map<ResumeFontAssetKey, ResumeFontAssetStatus>();
const promises = new Map<ResumeFontAssetKey, Promise<void>>();
const listeners = new Map<ResumeFontAssetKey, Set<() => void>>();

function notify(key: ResumeFontAssetKey) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function getResumeFontAssetStatus(key: ResumeFontAssetKey) {
  return statuses.get(key) ?? "idle";
}

export function loadResumeFontAssets(key: ResumeFontAssetKey, retry = false) {
  if (retry && getResumeFontAssetStatus(key) === "error") {
    promises.delete(key);
    statuses.delete(key);
  }
  const existing = promises.get(key);
  if (existing) return existing;

  statuses.set(key, "loading");
  notify(key);
  const promise = loaders[key]().then(
    () => {
      statuses.set(key, "ready");
      notify(key);
    },
    (error) => {
      statuses.set(key, "error");
      notify(key);
      throw error;
    },
  );
  promises.set(key, promise);
  return promise;
}

export function useResumeFontAssets(key: ResumeFontAssetKey) {
  const [status, setStatus] = useState(() => getResumeFontAssetStatus(key));

  useEffect(() => {
    const keyListeners = listeners.get(key) ?? new Set<() => void>();
    const refresh = () => setStatus(getResumeFontAssetStatus(key));
    keyListeners.add(refresh);
    listeners.set(key, keyListeners);
    refresh();
    void loadResumeFontAssets(key).catch(() => undefined);
    return () => {
      keyListeners.delete(refresh);
    };
  }, [key]);

  return {
    status,
    retry: () => loadResumeFontAssets(key, true),
  };
}

export function ResumeFontAssets({
  assetKey,
  onStatusChange,
}: {
  assetKey: ResumeFontAssetKey;
  onStatusChange?: (
    assetKey: ResumeFontAssetKey,
    status: ResumeFontAssetStatus,
  ) => void;
}) {
  const { status } = useResumeFontAssets(assetKey);

  useEffect(() => {
    onStatusChange?.(assetKey, status);
  }, [assetKey, onStatusChange, status]);

  return null;
}
