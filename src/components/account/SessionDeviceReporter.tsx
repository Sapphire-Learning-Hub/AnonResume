"use client";

import { useEffect } from "react";

type NavigatorUAData = {
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{
    model?: string;
    platformVersion?: string;
  }>;
};

export function SessionDeviceReporter() {
  useEffect(() => {
    const userAgentData = (navigator as Navigator & {
      userAgentData?: NavigatorUAData;
    }).userAgentData;
    let active = true;

    async function reportDevice() {
      let payload: Record<string, string> = {};
      if (userAgentData?.getHighEntropyValues) {
        try {
          const values = await userAgentData.getHighEntropyValues([
            "model",
            "platformVersion",
          ]);
          if (values.platformVersion) {
            payload = {
              platform: userAgentData.platform,
              platformVersion: values.platformVersion,
              model: values.model || "",
            };
          }
        } catch {
          // The PATCH request can still carry HTTP Client Hints.
        }
      }
      if (!active) return;
      await fetch("/api/account/sessions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => undefined);
    }

    void reportDevice();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
