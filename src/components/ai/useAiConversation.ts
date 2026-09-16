"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

import type { AiClientStreamEvent } from "@/lib/ai/runs/stream-events";
import {
  createAiConversation,
  deleteAiConversation,
  fetchAiConversation,
  fetchAiConversationIndex,
  sendAiMessage,
  stopAiRun,
  updateAiConversation,
  type AiConversationDetails,
  type AiConversationSummary,
  type AiModelOption,
} from "@/lib/ai/client";

export function useAiConversation({
  open,
  resumeId,
  resumeVersion,
  sectionId,
  onError,
}: {
  open: boolean;
  resumeId: string;
  resumeVersion: number;
  sectionId?: string;
  onError: (error: unknown) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [contextScope, setContextScope] = useState<"resume" | "section">(
    "resume",
  );
  const [details, setDetails] = useState<AiConversationDetails>();
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const [pendingAfterSequence, setPendingAfterSequence] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingProposalText, setStreamingProposalText] = useState("");
  const [liveRunId, setLiveRunId] = useState<string>();
  const reportError = useEffectEvent(onError);

  const loadIndex = useCallback(async () => {
    const result = await fetchAiConversationIndex(resumeId);
    setEnabled(result.enabled);
    setConversations(result.conversations);
    setModels(result.models);
    setSelectedModelId((current) =>
      result.models.some((model) => model.id === current)
        ? current
        : result.models[0]?.id,
    );
    setSelectedConversationId((current) =>
      result.conversations.some((conversation) => conversation.id === current)
        ? current
        : result.conversations[0]?.id,
    );
  }, [resumeId]);

  const loadDetails = useCallback(async (conversationId: string) => {
    const result = await fetchAiConversation(conversationId);
    setDetails(result);
    return result;
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) setLoading(true);
      try {
        await loadIndex();
      } catch (error) {
        if (active) reportError(error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadIndex, open]);

  useEffect(() => {
    if (!open || !selectedConversationId) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) setLoading(true);
      try {
        await loadDetails(selectedConversationId);
      } catch (error) {
        if (active) reportError(error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadDetails, open, selectedConversationId]);

  const activeRunId = details?.activeRun?.id;
  useEffect(() => {
    if (!open || !selectedConversationId || !activeRunId) return;
    const timer = window.setInterval(() => {
      void loadDetails(selectedConversationId).catch(reportError);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [activeRunId, loadDetails, open, selectedConversationId]);

  async function send(message: string) {
    let conversationId = selectedConversationId;
    if (!conversationId) {
      if (!selectedModelId) throw new Error("ai_model_unavailable");
      const created = await createAiConversation({
        resumeId,
        modelId: selectedModelId,
        title: message.slice(0, 36),
        contextScope: contextScope === "section" && sectionId ? "section" : "resume",
        sectionId: contextScope === "section" ? sectionId : undefined,
      });
      conversationId = created.conversation.id;
      setConversations((current) => [created.conversation, ...current]);
      setSelectedConversationId(conversationId);
    }

    setSending(true);
    setPendingUserMessage(message);
    setPendingAfterSequence(details?.messages.at(-1)?.sequence ?? 0);
    setStreamingText("");
    setStreamingProposalText("");
    try {
      await sendAiMessage({
        conversationId,
        message,
        resumeVersion,
        onRun: setLiveRunId,
        onEvent(event: AiClientStreamEvent) {
          if (event.type === "text_delta") {
            setStreamingText((current) => current + event.delta);
          }
          if (event.type === "proposal_delta") {
            setStreamingProposalText((current) => current + event.delta);
          }
        },
      });
      await Promise.all([loadDetails(conversationId), loadIndex()]);
      setStreamingText("");
      setStreamingProposalText("");
    } finally {
      setSending(false);
      setPendingUserMessage("");
      setStreamingText("");
      setStreamingProposalText("");
      setLiveRunId(undefined);
    }
  }

  async function stop() {
    const runId = liveRunId ?? details?.activeRun?.id;
    if (!runId) return;
    await stopAiRun(runId);
  }

  async function rename(title: string) {
    if (!selectedConversationId) return;
    await updateAiConversation(selectedConversationId, { title });
    await Promise.all([loadDetails(selectedConversationId), loadIndex()]);
  }

  async function archive() {
    if (!selectedConversationId) return;
    await updateAiConversation(selectedConversationId, { archived: true });
    setSelectedConversationId(undefined);
    setDetails(undefined);
    await loadIndex();
  }

  async function remove() {
    if (!selectedConversationId) return;
    await deleteAiConversation(selectedConversationId);
    setSelectedConversationId(undefined);
    setDetails(undefined);
    await loadIndex();
  }

  return {
    enabled,
    loading,
    sending,
    conversations,
    models,
    selectedConversationId,
    selectedModelId,
    contextScope,
    details,
    pendingUserMessage,
    pendingAfterSequence,
    streamingText,
    streamingProposalText,
    setSelectedConversationId,
    setSelectedModelId,
    setContextScope,
    startNewConversation() {
      setSelectedConversationId(undefined);
      setDetails(undefined);
      setContextScope("resume");
    },
    send,
    stop,
    rename,
    archive,
    remove,
    refresh: async () => {
      if (selectedConversationId) await loadDetails(selectedConversationId);
    },
  };
}
