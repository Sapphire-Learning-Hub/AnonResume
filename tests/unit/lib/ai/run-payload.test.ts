import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  decryptPreparedAiRunPayload,
  encryptPreparedAiRunPayload,
} from "@/lib/ai/runs/run-payload";
import type { PreparedAiRun } from "@/lib/ai/runs/service";

describe("AI run execution payload", () => {
  const encryptionKey = Buffer.alloc(32, 12);

  function preparedRun(): PreparedAiRun {
    return {
      runId: "00000000-0000-4000-8000-000000000001",
      userId: "user-one",
      resumeId: "resume-one",
      conversationId: "00000000-0000-4000-8000-000000000002",
      assistantMessageId: "00000000-0000-4000-8000-000000000003",
      resumeVersion: 1,
      request: {
        diagnosticRunId: "00000000-0000-4000-8000-000000000001",
        endpoint: new URL("https://models.example.com/v1"),
        apiKey: "sk-encrypted-inside-payload",
        model: "example-model",
        messages: [{ role: "user", content: "Improve this resume" }],
        maxOutputTokens: 1_024,
        latencyPreference: "fast",
        trustedEndpointHostnames: ["models.example.com"],
      },
      auditRequest: { model: "example-model" },
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints: 1_000,
        requestsPerMinute: 10,
        streamCheckpointMs: 1_000,
        runLeaseSeconds: 90,
        maxConcurrentRuns: 1,
        platformEnabled: true,
        byokEnabled: true,
        trustedEndpointHostnames: ["models.example.com"],
      },
      keySource: "platform",
      rates: {
        inputPointsPerMillion: 100,
        cachedInputPointsPerMillion: 10,
        outputPointsPerMillion: 500,
      },
      rateCardVersion: 2,
      reservationOperationId: "00000000-0000-4000-8000-000000000001",
      reservedPoints: 20,
      proposalTargets: [],
      resumeDocument: createDefaultResumeDocument("en-US"),
      providerContext: { sections: [] },
    };
  }

  it("round-trips the immutable execution snapshot", () => {
    const prepared = preparedRun();
    const encrypted = encryptPreparedAiRunPayload(prepared, encryptionKey);

    expect(encrypted.toString("utf8")).not.toContain(prepared.request.apiKey);
    const restored = decryptPreparedAiRunPayload({
      encryptedPayload: encrypted,
      encryptionKey,
      expectedRunId: prepared.runId,
    });

    expect(restored).toMatchObject({
      runId: prepared.runId,
      request: {
        apiKey: prepared.request.apiKey,
        endpoint: new URL("https://models.example.com/v1"),
        model: "example-model",
      },
      rates: prepared.rates,
      resumeDocument: prepared.resumeDocument,
    });
    expect(restored.configuration.credentialsEncryptionKey).toEqual(
      encryptionKey,
    );
  });

  it("rejects a payload attached to a different run", () => {
    const encrypted = encryptPreparedAiRunPayload(preparedRun(), encryptionKey);

    expect(() =>
      decryptPreparedAiRunPayload({
        encryptedPayload: encrypted,
        encryptionKey,
        expectedRunId: "00000000-0000-4000-8000-000000000099",
      }),
    ).toThrow("ai_run_payload_mismatch");
  });
});
