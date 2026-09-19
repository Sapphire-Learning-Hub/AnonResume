import { streamAiRunSnapshots } from "@/lib/ai/runs/run-stream";

describe("AI run snapshot stream", () => {
  it("streams idempotent checkpoints until the run completes", async () => {
    const snapshots = [
      {
        id: "run-one",
        status: "queued" as const,
        sequence: 0,
        text: "",
        proposalText: null,
        proposalChanges: [],
        progress: ["analyzing_resume" as const],
        failureCode: null,
        finalPoints: null,
      },
      {
        id: "run-one",
        status: "streaming" as const,
        sequence: 3,
        text: "Draft",
        proposalText: null,
        proposalChanges: [],
        progress: ["analyzing_resume" as const, "drafting_response" as const],
        failureCode: null,
        finalPoints: null,
      },
      {
        id: "run-one",
        status: "complete" as const,
        sequence: 4,
        text: "Draft complete",
        proposalText: null,
        proposalChanges: [],
        progress: ["analyzing_resume" as const, "drafting_response" as const],
        failureCode: null,
        finalPoints: 1,
      },
    ];
    let index = 0;
    const events = [];

    for await (const event of streamAiRunSnapshots({
      read: async () => snapshots[Math.min(index++, snapshots.length - 1)]!,
      wait: async () => undefined,
      pollIntervalMs: 1,
      maxDurationMs: 1_000,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        sequence: 0,
        type: "snapshot",
        text: "",
        proposalText: "",
        proposalChanges: [],
        progress: ["analyzing_resume"],
      },
      {
        sequence: 3,
        type: "snapshot",
        text: "Draft",
        proposalText: "",
        proposalChanges: [],
        progress: ["analyzing_resume", "drafting_response"],
      },
      {
        sequence: 4,
        type: "snapshot",
        text: "Draft complete",
        proposalText: "",
        proposalChanges: [],
        progress: ["analyzing_resume", "drafting_response"],
      },
      { sequence: 5, type: "complete", finishReason: null },
    ]);
  });

  it("emits the persisted failure code for a terminal failed run", async () => {
    const events = [];
    for await (const event of streamAiRunSnapshots({
      read: async () => ({
        id: "run-two",
        status: "failed" as const,
        sequence: 2,
        text: "",
        proposalText: null,
        proposalChanges: [],
        progress: ["analyzing_resume" as const],
        failureCode: "authentication",
        finalPoints: 0,
      }),
      wait: async () => undefined,
      pollIntervalMs: 1,
      maxDurationMs: 1_000,
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({
      sequence: 3,
      type: "error",
      code: "authentication",
    });
  });
});
