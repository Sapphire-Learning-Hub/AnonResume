import { initializeLogging } from "@/lib/observability/logging";

export function initializeHttpLogCapture() {
  const lines: string[] = [];
  initializeLogging({
    destination: {
      write(line: string) {
        lines.push(line);
      },
    },
    identity: {
      deploymentId: "test-deployment",
      instanceId: "web-1",
      role: "web",
      sessionId: "session-1",
      stableId: "test-deployment/web/web-1",
    },
    role: "web",
  });

  return {
    events: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    lines,
  };
}
