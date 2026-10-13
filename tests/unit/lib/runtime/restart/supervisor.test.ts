import { resolveRuntimeSupervisor } from "@/lib/runtime/restart/supervisor";

describe("runtime restart supervisor detection", () => {
  it("trusts the fixed official Compose capability marker", () => {
    expect(
      resolveRuntimeSupervisor({
        environment: {
          ANONRESUME_PROCESS_SUPERVISOR: "docker-compose",
          INVOCATION_ID: "ignored-systemd-invocation",
        },
        fileExists: () => false,
      }),
    ).toEqual({
      kind: "docker-compose",
      reasonCode: null,
      restartSupported: true,
    });
  });

  it("recognizes a systemd service invocation without operator configuration", () => {
    expect(
      resolveRuntimeSupervisor({
        environment: { INVOCATION_ID: "systemd-invocation" },
        fileExists: () => false,
      }),
    ).toEqual({
      kind: "systemd",
      reasonCode: null,
      restartSupported: true,
    });
  });

  it("does not infer restart support from a container marker alone", () => {
    expect(
      resolveRuntimeSupervisor({
        environment: {},
        fileExists: (path) => path === "/.dockerenv",
      }),
    ).toEqual({
      kind: "container",
      reasonCode: "restart_policy_unverified",
      restartSupported: false,
    });
  });

  it("keeps manually managed processes unsupported", () => {
    expect(
      resolveRuntimeSupervisor({
        environment: {},
        fileExists: () => false,
      }),
    ).toEqual({
      kind: "manual",
      reasonCode: "supervisor_unavailable",
      restartSupported: false,
    });
  });
});
