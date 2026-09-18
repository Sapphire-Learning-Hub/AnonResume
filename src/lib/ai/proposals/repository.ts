import { and, eq, sql } from "drizzle-orm";

import { aiProposals, aiRuns, db, resumes } from "@/db";
import { applySelectedAiChanges } from "@/domain/resume/ai/proposal-apply";
import { aiResumeProposalSchema } from "@/domain/resume/ai/proposal-schema";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  buildResumeSummary,
  RESUME_SCHEMA_VERSION,
} from "@/lib/resume/repository";

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
    const [resume] = await transaction
      .select({
        customSummary: resumes.customSummary,
        document: resumes.document,
        summary: resumes.summary,
        updatedAt: resumes.updatedAt,
        version: resumes.version,
      })
      .from(resumes)
      .where(
        and(
          eq(resumes.userId, input.userId),
          eq(resumes.id, row.resumeId),
        ),
      )
      .for("update")
      .limit(1);
    if (!resume) throw new AiProposalNotFoundError();

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
    const [updatedResume] = await transaction
      .update(resumes)
      .set({
        name: applyResult.document.meta.title,
        summary: buildResumeSummary({
          document: applyResult.document,
          summary: resume.summary,
        }),
        customSummary: resume.customSummary,
        document: applyResult.document,
        schemaVersion: RESUME_SCHEMA_VERSION,
        version: sql`${resumes.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(resumes.userId, input.userId),
          eq(resumes.id, row.resumeId),
          eq(resumes.version, resume.version),
        ),
      )
      .returning({
        document: resumes.document,
        version: resumes.version,
        updatedAt: resumes.updatedAt,
      });
    if (!updatedResume) {
      throw new AiProposalConflictError(resume.version);
    }
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
        updatedAt: updatedResume.updatedAt.getTime(),
      },
    };
  });
}
