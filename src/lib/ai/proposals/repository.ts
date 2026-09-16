import { and, eq } from "drizzle-orm";

import { aiProposals, aiRuns, db } from "@/db";
import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";

export class AiProposalNotFoundError extends Error {
  constructor() {
    super("ai_proposal_not_found");
    this.name = "AiProposalNotFoundError";
  }
}

export async function markAiProposalApplied(input: {
  userId: string;
  proposalId: string;
  selectedChangeIds: string[];
}) {
  return db.transaction(async (transaction) => {
    const [row] = await transaction
      .select({
        proposal: aiProposals.proposal,
        appliedChangeIds: aiProposals.appliedChangeIds,
      })
      .from(aiProposals)
      .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
      .where(
        and(
          eq(aiProposals.id, input.proposalId),
          eq(aiRuns.userId, input.userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) throw new AiProposalNotFoundError();

    const proposal = aiResumeProposalSchema.parse(row.proposal);
    const availableIds = new Set(proposal.changes.map((change) => change.id));
    if (input.selectedChangeIds.some((id) => !availableIds.has(id))) {
      throw new AiProposalNotFoundError();
    }
    const appliedChangeIds = [
      ...new Set([...row.appliedChangeIds, ...input.selectedChangeIds]),
    ];
    const [updated] = await transaction
      .update(aiProposals)
      .set({ appliedChangeIds, appliedAt: new Date() })
      .where(eq(aiProposals.id, input.proposalId))
      .returning({
        id: aiProposals.id,
        appliedChangeIds: aiProposals.appliedChangeIds,
        appliedAt: aiProposals.appliedAt,
      });
    return updated!;
  });
}
