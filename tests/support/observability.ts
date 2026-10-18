import { initializeLogging } from "@/lib/observability/logging";

export function initializeLogCapture(
  role: "web" | "ai-worker" | "pdf-worker" = "web",
) {
  const lines: string[] = [];
  initializeLogging({
    destination: {
      write(line: string) {
        lines.push(line);
      },
    },
    identity: {
      deploymentId: "test-deployment",
      instanceId: `${role}-1`,
      role,
      sessionId: "session-1",
      stableId: `test-deployment/${role}/${role}-1`,
    },
    role,
  });

  return {
    events: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    lines,
  };
}

export const initializeHttpLogCapture = initializeLogCapture;
