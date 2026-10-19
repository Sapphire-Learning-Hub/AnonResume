import { and, eq, gt } from "drizzle-orm";
import { aiRuns, db } from "@/db";

export const activeRunControllers = new Map<string, AbortController>();

export function startAiRunLeaseMonitor(input: {
  runId: string; leaseOwner: string; leaseSeconds: number; controller: AbortController;
  intervalMs: number; onLeaseLost: () => void;
}) {
  let stopped = false;
  let polling = false;
  const timer = setInterval(() => {
    if (stopped || polling || input.controller.signal.aborted) return;
    polling = true;
    const now = new Date();
    void db.update(aiRuns).set({ leaseExpiresAt: new Date(now.getTime() + input.leaseSeconds * 1000), updatedAt: now })
      .where(and(eq(aiRuns.id, input.runId), eq(aiRuns.status, "streaming"), eq(aiRuns.leaseOwner, input.leaseOwner), gt(aiRuns.leaseExpiresAt, now)))
      .returning({ stopRequestedAt: aiRuns.stopRequestedAt })
      .then(([run]) => {
        if (stopped) return;
        if (!run) { input.onLeaseLost(); input.controller.abort(new Error("ai_run_lease_lost")); }
        else if (run.stopRequestedAt) input.controller.abort(new Error("ai_run_stopped"));
      }).catch(() => undefined).finally(() => { polling = false; });
  }, input.intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
