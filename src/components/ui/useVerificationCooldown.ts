"use client";

import { useEffect, useState } from "react";

const DEFAULT_COOLDOWN_MS = 60_000;

export function useVerificationCooldown() {
  const [availableAt, setAvailableAt] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const remainingSeconds = availableAt === undefined
    ? 0
    : Math.max(0, Math.ceil((availableAt - now) / 1000));

  useEffect(() => {
    if (availableAt === undefined || remainingSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setNow(Date.now());
    }, Math.min(1000, Math.max(0, availableAt - Date.now())));

    return () => window.clearTimeout(timer);
  }, [availableAt, remainingSeconds]);

  function startCooldown(resendAvailableAt?: string) {
    const currentTime = Date.now();
    const serverTime = resendAvailableAt
      ? Date.parse(resendAvailableAt)
      : Number.NaN;
    setNow(currentTime);
    setAvailableAt(
      Number.isFinite(serverTime)
        ? serverTime
        : currentTime + DEFAULT_COOLDOWN_MS,
    );
  }

  function resetCooldown() {
    setAvailableAt(undefined);
    setNow(Date.now());
  }

  return { remainingSeconds, resetCooldown, startCooldown };
}
