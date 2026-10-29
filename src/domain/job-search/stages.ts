import type { ApplicationStage } from "./schema";

export function resolveStageChange(input: {
  from: ApplicationStage;
  to: ApplicationStage;
  appliedAt: string | null;
  nextAppliedAt?: string;
  confirmReset?: boolean;
  now: Date;
}): { appliedAt: string | null } {
  if (input.to === "pending") {
    if (input.appliedAt && !input.confirmReset)
      throw new Error("application_reset_confirmation_required");
    return { appliedAt: null };
  }
  const date = input.nextAppliedAt ?? input.appliedAt;
  if (!date && input.to === "withdrawn") return { appliedAt: null };
  if (!date) throw new Error("application_date_required");
  const parsed = new Date(date);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getTime() > input.now.getTime() + 60_000
  )
    throw new Error("invalid_application_date");
  return { appliedAt: parsed.toISOString() };
}
