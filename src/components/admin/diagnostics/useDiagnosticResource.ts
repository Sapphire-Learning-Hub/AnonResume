"use client";

import { managementFetch } from "@/lib/admin/client/request";

import { useEffect, useState } from "react";

export function useDiagnosticResource<T>(url: string | undefined, revision: number, schema: { parse(input: unknown): T }) {
  const key = `${url ?? ""}:${revision}`;
  const [result,setResult] = useState<{ key: string; data?: T; status?: number }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await managementFetch(url,{ signal: controller.signal, cache: "no-store" });
        if (!response.ok) { if (!controller.signal.aborted) setResult({ key,status:response.status }); return; }
        const data = schema.parse(await response.json());
        if (!controller.signal.aborted) setResult({ key,data });
      } catch { if (!controller.signal.aborted) setResult({ key,status:503 }); }
    })();
    return () => controller.abort();
  },[key,url,schema]);
  const current = result?.key === key ? result : undefined;
  return { data:current?.data, status:current?.status, loading:Boolean(url && !current) };
}
