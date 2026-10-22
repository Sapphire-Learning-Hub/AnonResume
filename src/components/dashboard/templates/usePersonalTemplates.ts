"use client";
import { useEffect, useState } from "react";
import { fetchPersonalTemplatePage } from "@/lib/resume/templates/client";
import type { TemplatePage } from "@/lib/resume/templates/types";

export function usePersonalTemplates(query: string, enabled = true) {
  const [response, setResponse] = useState<{
    key: string;
    page: TemplatePage;
    error?: unknown;
  }>();
  const [moreBusy, setMoreBusy] = useState<string>();
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([query, revision]);
  const current = response?.key === key ? response : undefined;
  const page = current?.page ?? { items: [], nextCursor: null };
  const busy = enabled && (!current || moreBusy === key);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchPersonalTemplatePage(query)
      .then((result) => {
        if (active) setResponse({ key, page: result });
      })
      .catch((error: unknown) => {
        if (active)
          setResponse({ key, page: { items: [], nextCursor: null }, error });
      });
    return () => {
      active = false;
    };
  }, [query, key, enabled]);
  async function more() {
    if (busy || !page.nextCursor) return;
    setMoreBusy(key);
    try {
      const result = await fetchPersonalTemplatePage(query, page.nextCursor);
      setResponse((previous) =>
        previous?.key === key
          ? {
              key,
              page: {
                items: [
                  ...new Map(
                    [...previous.page.items, ...result.items].map((entry) => [
                      entry.id,
                      entry,
                    ]),
                  ).values(),
                ],
                nextCursor: result.nextCursor,
              },
            }
          : previous,
      );
    } catch (error) {
      setResponse((previous) =>
        previous?.key === key ? { ...previous, error } : previous,
      );
    } finally {
      setMoreBusy((previous) => (previous === key ? undefined : previous));
    }
  }
  return {
    page,
    busy,
    error: current?.error,
    more,
    refresh: () => setRevision((value) => value + 1),
  };
}
