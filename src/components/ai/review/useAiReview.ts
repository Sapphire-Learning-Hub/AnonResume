"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { fetchAiConversationIndex, streamAiRun, AiClientError, type AiModelOption } from "@/lib/ai/client";
import { getResumeReview, listResumeReviews } from "@/lib/ai/review/client";
import type { ReviewDetails, ReviewPage } from "@/lib/ai/review/validation";

export function useAiReview({ resumeId, resumeVersion, initialReviewId, onError }: { resumeId: string; resumeVersion: number; initialReviewId?: string; onError: (error: unknown) => void }) {
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [page, setPage] = useState<ReviewPage>({ items: [], nextCursor: null });
  const [selectedId, setSelectedId] = useState<string | undefined>(initialReviewId);
  const [details, setDetails] = useState<ReviewDetails>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reportError = useEffectEvent(onError);
  function refresh() { setRevision((value) => value + 1); }

  useEffect(() => {
    const controller = new AbortController();
    void listResumeReviews(resumeId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setPage(result);
      setSelectedId((current) => current ?? result.items.find((item) => ["queued", "preparing", "streaming"].includes(item.status))?.id);
    }).catch((error) => { if (!controller.signal.aborted) reportError(error); });
    void fetchAiConversationIndex(resumeId).then((result) => { if (!controller.signal.aborted) setModels(result.models); }).catch((error) => { if (!controller.signal.aborted) reportError(error); });
    return () => controller.abort();
  }, [resumeId, revision]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setLoadError(false);
      setDetails(undefined);
      try {
        let current = await getResumeReview(selectedId, controller.signal);
        if (controller.signal.aborted) return;
        setDetails(current);
        if (["queued", "preparing", "streaming"].includes(current.status)) {
          try {
            await streamAiRun({ runId: current.runId, signal: controller.signal, onEvent(event) {
              if (controller.signal.aborted) return;
              if (event.type === "snapshot") setDetails((value) => value ? { ...value, progress: event.progress } : value);
              if (event.type === "progress") setDetails((value) => value ? { ...value, progress: [...value.progress.filter((stage) => stage !== event.stage), event.stage] } : value);
            } });
          } catch (error) {
            if (controller.signal.aborted) return;
            if (!(error instanceof AiClientError)) throw error;
          }
          current = await getResumeReview(selectedId, controller.signal);
          if (!controller.signal.aborted) {
            setDetails(current);
            const index = await listResumeReviews(resumeId, controller.signal);
            if (!controller.signal.aborted) setPage(index);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) { setLoadError(true); reportError(error); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [selectedId, resumeId, resumeVersion, revision]);

  async function loadMore() {
    if (!page.nextCursor) return;
    const result = await listResumeReviews(resumeId, undefined, page.nextCursor);
    setPage((current) => ({ items: [...current.items, ...result.items.filter((item) => !current.items.some((previous) => previous.id === item.id))], nextCursor: result.nextCursor }));
  }
  return { models, page, selectedId, setSelectedId, details, setDetails, loading, loadError, refresh, loadMore };
}
