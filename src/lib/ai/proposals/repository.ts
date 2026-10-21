import { and, eq } from "drizzle-orm";

import { aiProposals, aiRuns, db } from "@/db";
import { applySelectedAiChanges } from "@/domain/resume/ai/proposal-apply";
import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  lockOwnedResume,
  saveResumeRecordWithExecutor,
} from "@/lib/resume/repository";
import { ResumeTrashedError } from "@/lib/resume/trash/errors";

export class AiProposalNotFoundError extends Error {
  constructor() {
    super("ai_proposal_not_found");
    this.name = "AiProposalNotFoundError";
  }
}

export class AiProposalConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("ai_resume_version_conflict");
    this.name = "AiProposalConflictError";
  }
}

export async function markAiProposalApplied(input: {
  userId: string;
  proposalId: string;
  selectedChangeIds: string[];
}) {
  return db.transaction(async (transaction) => {
    const [target] = await transaction
      .select({ resumeId: aiRuns.resumeId })
      .from(aiProposals)
      .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
      .where(
        and(
          eq(aiProposals.id, input.proposalId),
          eq(aiRuns.userId, input.userId),
        ),
      )
      .limit(1);
    if (!target) throw new AiProposalNotFoundError();
    const resume = await lockOwnedResume(
      transaction,
      input.userId,
      target.resumeId,
    );
    if (resume.deletedAt) throw new ResumeTrashedError();
    const [row] = await transaction
      .select({
        proposal: aiProposals.proposal,
        appliedChangeIds: aiProposals.appliedChangeIds,
        appliedAt: aiProposals.appliedAt,
        baseResumeVersion: aiProposals.baseResumeVersion,
        resumeId: aiRuns.resumeId,
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
    const pendingChangeIds = input.selectedChangeIds.filter(
      (id) => !row.appliedChangeIds.includes(id),
    );
    if (pendingChangeIds.length === 0) {
      return {
        proposal: {
          id: input.proposalId,
          appliedChangeIds: row.appliedChangeIds,
          appliedAt: row.appliedAt,
        },
        resume: {
          document: validateResumeDocument(resume.document),
          version: resume.version,
          updatedAt: resume.updatedAt.getTime(),
        },
      };
    }

    const currentDocument = validateResumeDocument(resume.document);
    const applyResult = applySelectedAiChanges({
      document: currentDocument,
      currentVersion: resume.version,
      baseResumeVersion:
        row.appliedChangeIds.length > 0
          ? resume.version
          : row.baseResumeVersion,
      proposal,
      selectedChangeIds: pendingChangeIds,
    });
    if (!applyResult.ok) {
      throw new AiProposalConflictError(resume.version);
    }
    const updatedResume = await saveResumeRecordWithExecutor(transaction, {
      userId: input.userId,
      resumeId: row.resumeId,
      version: resume.version,
      document: applyResult.document,
    });
    const appliedChangeIds = [
      ...new Set([...row.appliedChangeIds, ...pendingChangeIds]),
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
    return {
      proposal: updated!,
      resume: {
        document: validateResumeDocument(updatedResume.document),
        version: updatedResume.version,
        updatedAt: updatedResume.updatedAt,
      },
    };
  });
}
