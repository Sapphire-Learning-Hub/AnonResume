import type { AiRunStatus } from "@/db/ai-schema";
import type {
  AiClientStreamEvent,
  AiProposalProgressChange,
  AiRunProgressStage,
} from "@/lib/ai/runs/stream-events";

export interface AiRunSnapshot {
  id: string;
  status: AiRunStatus;
  sequence: number;
  text: string;
  proposalText: unknown;
  proposalChanges: AiProposalProgressChange[];
  progress: AiRunProgressStage[];
  failureCode: string | null;
  finalPoints: number | null;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

function terminalEvent(snapshot: AiRunSnapshot): AiClientStreamEvent | undefined {
  if (
    snapshot.status === "queued" ||
    snapshot.status === "preparing" ||
    snapshot.status === "streaming"
  ) {
    return undefined;
  }
  if (
    snapshot.status === "complete" ||
    (snapshot.status === "settlement_pending" && !snapshot.failureCode)
  ) {
    return {
      sequence: snapshot.sequence + 1,
      type: "complete",
      finishReason: null,
    };
  }
  return {
    sequence: snapshot.sequence + 1,
    type: "error",
    code: snapshot.failureCode ?? snapshot.status,
  };
}

export async function* streamAiRunSnapshots(input: {
  read: () => Promise<AiRunSnapshot | null>;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxDurationMs?: number;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): AsyncGenerator<AiClientStreamEvent> {
  const pollIntervalMs = input.pollIntervalMs ?? 250;
  const maxDurationMs = input.maxDurationMs ?? 25_000;
  const now = input.now ?? Date.now;
  const wait = input.wait ?? delay;
  const deadline = now() + maxDurationMs;
  let previousSignature = "";

  while (!input.signal?.aborted && now() < deadline) {
    const snapshot = await input.read();
    if (!snapshot) return;
    const proposalText =
      typeof snapshot.proposalText === "string" ? snapshot.proposalText : "";
    const signature = JSON.stringify([
      snapshot.status,
      snapshot.sequence,
      snapshot.text,
      proposalText,
      snapshot.proposalChanges,
      snapshot.progress,
      snapshot.failureCode,
    ]);
    if (signature !== previousSignature) {
      yield {
        sequence: snapshot.sequence,
        type: "snapshot",
        text: snapshot.text,
        proposalText,
        proposalChanges: snapshot.proposalChanges,
        progress: snapshot.progress,
      };
      previousSignature = signature;
    }

    const terminal = terminalEvent(snapshot);
    if (terminal) {
      yield terminal;
      return;
    }
    await wait(pollIntervalMs, input.signal);
  }
}
