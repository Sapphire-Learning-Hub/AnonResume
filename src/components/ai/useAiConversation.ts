"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  AiClientStreamEvent,
  AiProposalProgressChange,
  AiRunProgressStage,
} from "@/lib/ai/runs/stream-events";
import {
  AiClientError,
  createAiConversation,
  deleteAiConversation,
  fetchAiConversation,
  fetchAiConversationIndex,
  sendAiMessage,
  streamAiRun,
  stopAiRun,
  updateAiConversation,
  type AiConversationDetails,
  type AiConversationSummary,
  type AiModelOption,
} from "@/lib/ai/client";

type RunIdWaiter = {
  promise: Promise<string | undefined>;
  settle: (runId?: string) => void;
};

function createRunIdWaiter(): RunIdWaiter {
  let settled = false;
  let resolvePromise!: (runId?: string) => void;
  const promise = new Promise<string | undefined>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    settle(runId) {
      if (settled) return;
      settled = true;
      resolvePromise(runId);
    },
  };
}

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
  const [stopping, setStopping] = useState(false);
  const [conversations, setConversations] = useState<AiConversationSummary[]>(
    [],
  );
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>();
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [contextScope, setContextScope] = useState<"resume" | "section">(
    "resume",
  );
  const [details, setDetails] = useState<AiConversationDetails>();
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const [pendingAfterSequence, setPendingAfterSequence] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingProposalText, setStreamingProposalText] = useState("");
  const [streamingProposalChanges, setStreamingProposalChanges] = useState<
    AiProposalProgressChange[]
  >([]);
  const [streamingProgressStages, setStreamingProgressStages] = useState<
    AiRunProgressStage[]
  >([]);
  const liveRunIdRef = useRef<string | undefined>(undefined);
  const streamPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const runIdWaiterRef = useRef<RunIdWaiter | undefined>(undefined);
  const intentionalStopRef = useRef(false);
  const reportError = useEffectEvent(onError);
  function consumeStreamEvent(event: AiClientStreamEvent) {
    if (event.type === "snapshot") {
      setStreamingText(event.text);
      setStreamingProposalText(event.proposalText);
      setStreamingProposalChanges(event.proposalChanges);
      setStreamingProgressStages(event.progress);
    }
    if (event.type === "progress") {
      setStreamingProgressStages((current) =>
        current.includes(event.stage) ? current : [...current, event.stage],
      );
    }
    if (event.type === "text_delta") {
      setStreamingText((current) => current + event.delta);
    }
    if (event.type === "proposal_delta") {
      setStreamingProposalText((current) => current + event.delta);
    }
    if (event.type === "proposal_progress") {
      setStreamingProposalChanges((current) => {
        const byId = new Map(current.map((change) => [change.id, change]));
        for (const change of event.changes) byId.set(change.id, change);
        return [...byId.values()];
      });
    }
    if (event.type === "proposal_reset") {
      setStreamingProposalText("");
      setStreamingProposalChanges([]);
    }
  }
  const consumeReconnectedStreamEvent = useEffectEvent(consumeStreamEvent);

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
    const controller = new AbortController();
    liveRunIdRef.current = activeRunId;
    const streamPromise = streamAiRun({
      runId: activeRunId,
      signal: controller.signal,
      onEvent: consumeReconnectedStreamEvent,
    })
      .then(async () => {
        await Promise.all([loadDetails(selectedConversationId), loadIndex()]);
      })
      .catch((error) => {
        const stopped =
          error instanceof AiClientError && error.code === "stopped";
        if (!controller.signal.aborted && !stopped) reportError(error);
      })
      .finally(() => {
        if (streamPromiseRef.current === streamPromise) {
          streamPromiseRef.current = undefined;
          if (liveRunIdRef.current === activeRunId) {
            liveRunIdRef.current = undefined;
          }
          setStreamingText("");
          setStreamingProposalText("");
          setStreamingProposalChanges([]);
          setStreamingProgressStages([]);
        }
      });
    streamPromiseRef.current = streamPromise;
    return () => controller.abort();
  }, [activeRunId, loadDetails, loadIndex, open, selectedConversationId]);

  async function send(message: string) {
    let conversationId = selectedConversationId;
    if (!conversationId) {
      if (!selectedModelId) throw new Error("ai_model_unavailable");
      const created = await createAiConversation({
        resumeId,
        modelId: selectedModelId,
        title: message.slice(0, 36),
        contextScope:
          contextScope === "section" && sectionId ? "section" : "resume",
        sectionId: contextScope === "section" ? sectionId : undefined,
      });
      conversationId = created.conversation.id;
      setConversations((current) => [created.conversation, ...current]);
      setSelectedConversationId(conversationId);
    }

    const runIdWaiter = createRunIdWaiter();
    runIdWaiterRef.current = runIdWaiter;
    setSending(true);
    setPendingUserMessage(message);
    setPendingAfterSequence(details?.messages.at(-1)?.sequence ?? 0);
    setStreamingText("");
    setStreamingProposalText("");
    setStreamingProposalChanges([]);
    setStreamingProgressStages([]);
    let streamPromise: Promise<void> | undefined;
    try {
      streamPromise = sendAiMessage({
        conversationId,
        message,
        resumeVersion,
        onRun(runId) {
          liveRunIdRef.current = runId;
          runIdWaiter.settle(runId);
        },
        onEvent: consumeStreamEvent,
      });
      streamPromiseRef.current = streamPromise;
      await streamPromise;
      await Promise.all([loadDetails(conversationId), loadIndex()]);
      setStreamingText("");
      setStreamingProposalText("");
      setStreamingProposalChanges([]);
      setStreamingProgressStages([]);
    } catch (error) {
      if (
        intentionalStopRef.current &&
        error instanceof AiClientError &&
        error.code === "stopped"
      ) {
        return;
      }
      throw error;
    } finally {
      runIdWaiter.settle();
      if (runIdWaiterRef.current === runIdWaiter) {
        runIdWaiterRef.current = undefined;
      }
      setSending(false);
      setPendingUserMessage("");
      setStreamingText("");
      setStreamingProposalText("");
      setStreamingProposalChanges([]);
      setStreamingProgressStages([]);
      if (streamPromiseRef.current === streamPromise) {
        liveRunIdRef.current = undefined;
        streamPromiseRef.current = undefined;
      }
    }
  }

  async function stop() {
    setStopping(true);
    intentionalStopRef.current = true;
    try {
      const runId =
        liveRunIdRef.current ??
        details?.activeRun?.id ??
        (await runIdWaiterRef.current?.promise);
      if (!runId) return;
      const streamPromise = streamPromiseRef.current;
      await stopAiRun(runId);
      await streamPromise?.catch((error) => {
        if (error instanceof AiClientError && error.code === "stopped") return;
        throw error;
      });
      const result = await stopAiRun(runId, "if-empty");
      if (!("retracted" in result)) return;
      if (selectedConversationId) await loadDetails(selectedConversationId);
      return result.retracted ? result.message : undefined;
    } finally {
      intentionalStopRef.current = false;
      setStopping(false);
    }
  }

  async function edit(runId: string) {
    setStopping(true);
    try {
      const result = await stopAiRun(runId, "always");
      if (!("retracted" in result) || !result.retracted) {
        throw new AiClientError("ai_turn_not_editable", 409);
      }
      if (selectedConversationId) await loadDetails(selectedConversationId);
      return result.message;
    } finally {
      setStopping(false);
    }
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
    stopping,
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
    streamingProposalChanges,
    streamingProgressStages,
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
    edit,
    rename,
    archive,
    remove,
    refresh: async () => {
      if (selectedConversationId) await loadDetails(selectedConversationId);
    },
  };
}
