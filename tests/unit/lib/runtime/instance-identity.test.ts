import {
  createLeaseOwner,
  resolveRuntimeIdentity,
} from "@/lib/runtime/instance-identity";

describe("runtime instance identity", () => {
  it("uses a stable hostname identity and the systemd invocation as its session", () => {
    const identity = resolveRuntimeIdentity("ai-worker", {
      environment: {
        INVOCATION_ID: "systemd-session-1",
      },
      hostname: () => "resume-node-1",
      randomSessionId: () => "random-session",
    });

    expect(identity).toEqual({
      deploymentId: "default",
      instanceId: "resume-node-1",
      role: "ai-worker",
      sessionId: "systemd-session-1",
      stableId: "default/ai-worker/resume-node-1",
    });
  });

  it("allows deployment systems to provide explicit stable identities", () => {
    const identity = resolveRuntimeIdentity("pdf-worker", {
      environment: {
        ANONRESUME_DEPLOYMENT_ID: "production-cn",
        ANONRESUME_INSTANCE_ID: "pdf-2",
        ANONRESUME_SESSION_ID: "pod-uid-2",
        INVOCATION_ID: "ignored-systemd-session",
      },
      hostname: () => "ignored-host",
      randomSessionId: () => "ignored-random-session",
    });

    expect(identity.stableId).toBe("production-cn/pdf-worker/pdf-2");
    expect(identity.sessionId).toBe("pod-uid-2");
  });

  it("keeps roles distinct on a traditional single-host deployment", () => {
    const options = {
      environment: {},
      hostname: () => "resume-node-1",
      randomSessionId: () => "session-1",
    };

    expect(resolveRuntimeIdentity("web", options).stableId).not.toBe(
      resolveRuntimeIdentity("ai-worker", options).stableId,
    );
  });

  it("gives web replicas a stable setup-code source identity", () => {
    const identity = resolveRuntimeIdentity("web", {
      environment: {
        ANONRESUME_DEPLOYMENT_ID: "production",
        ANONRESUME_INSTANCE_ID: "web-2",
      },
      randomSessionId: () => "session-9",
    });

    expect(identity.stableId).toBe("production/web/web-2");
    expect(identity.sessionId).toBe("session-9");
  });

  it("uses the process session as a lease fencing token", () => {
    expect(
      createLeaseOwner({
        stableId: "production/ai-worker/ai-1",
        sessionId: "session-7",
      }),
    ).toBe("production/ai-worker/ai-1/session-7");
  });

  it("rejects identity segments that make database diagnostics ambiguous", () => {
    expect(() =>
      resolveRuntimeIdentity("web", {
        environment: { ANONRESUME_INSTANCE_ID: "web/one" },
        hostname: () => "ignored",
        randomSessionId: () => "session",
      }),
    ).toThrow("ANONRESUME_INSTANCE_ID");
  });
});
