import type { AiProposalCompletionState } from "@/db/ai-schema";
import type { ValidatedReviewReport } from "@/domain/resume/ai/review/schema";
import { getDatabaseSchemaName } from "@/db";
import {
  settleAiQuotaInTransaction,
  type AiQuotaSettlementInput,
} from "@/lib/ai/usage/ledger";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

interface FinalProposal {
  baseResumeVersion: number;
  targetHashes: Record<string, string>;
  proposal: unknown;
  completionState: AiProposalCompletionState;
}

type FinalRunInput = {
  runId: string;
  failureCode?: string;
  leaseOwner: string;
  sequence: number;
  text: string;
  proposalText: string;
  providerRequestId?: string;
  settlement?: AiQuotaSettlementInput;
  usage?: Pick<AiQuotaSettlementInput, "inputTokens" | "cachedInputTokens" | "outputTokens">;
} & ({
  kind?: "conversation";
  assistantMessageId: string;
  proposal?: FinalProposal;
  review?: never;
} | {
  kind: "resume_review";
  assistantMessageId?: never;
  proposal?: never;
  review?: { id: string; report: ValidatedReviewReport };
});

export async function finalizeOwnedAiRun(input: FinalRunInput) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const ownedRun = await client.query<{ id: string }>(
      `SELECT id::text
         FROM ${table("ai_runs")}
        WHERE id = $1
          AND status = 'streaming'
          AND lease_owner = $2
          AND stop_requested_at IS NULL
          AND lease_expires_at > clock_timestamp()
          AND kind = $3
        FOR UPDATE`,
      [input.runId, input.leaseOwner, input.kind ?? "conversation"],
    );
    if (!ownedRun.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }

    if (input.review) {
      const saved = await client.query(
        `UPDATE ${table("ai_resume_reviews")} SET report = $3::jsonb WHERE id = $1 AND run_id = $2`,
        [input.review.id, input.runId, JSON.stringify(input.review.report)],
      );
      if (!saved.rowCount) { await client.query("ROLLBACK"); return false; }
    }

    if (input.proposal) {
      await client.query(
        `INSERT INTO ${table("ai_proposals")}
           (run_id, base_resume_version, target_hashes, proposal, completion_state)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [
          input.runId,
          input.proposal.baseResumeVersion,
          JSON.stringify(input.proposal.targetHashes),
          JSON.stringify(input.proposal.proposal),
          input.proposal.completionState,
        ],
      );
    }

    if (input.settlement) {
      await settleAiQuotaInTransaction(client, input.settlement);
    }

    const finishedRun = await client.query<{ id: string }>(
      `UPDATE ${table("ai_runs")}
          SET status = $3,
              final_points = $4,
              checkpoint_sequence = $5,
              checkpoint_text = $6,
              checkpoint_proposal = $7::jsonb,
              provider_request_id = $8,
              input_tokens = $9,
              cached_input_tokens = $10,
              output_tokens = $11,
              failure_code = $12,
              completed_at = now(),
              encrypted_execution_payload = NULL,
              execution_payload_key_version = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = now()
        WHERE id = $1
          AND status = 'streaming'
          AND lease_owner = $2
          AND stop_requested_at IS NULL
          AND lease_expires_at > clock_timestamp()
        RETURNING id::text`,
      [
        input.runId,
        input.leaseOwner,
        input.settlement ? (input.failureCode ? "failed" : "complete") : "settlement_pending",
        input.settlement?.actualPoints ?? null,
        input.sequence,
        input.text,
        input.proposalText ? JSON.stringify(input.proposalText) : null,
        input.providerRequestId ?? null,
        input.settlement?.inputTokens ?? input.usage?.inputTokens ?? null,
        input.settlement?.cachedInputTokens ?? input.usage?.cachedInputTokens ?? null,
        input.settlement?.outputTokens ?? input.usage?.outputTokens ?? null,
        input.failureCode ?? null,
      ],
    );
    if (!finishedRun.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    if (input.assistantMessageId) await client.query(
      `UPDATE ${table("ai_messages")}
          SET text = $2, completion_state = 'complete', updated_at = now()
        WHERE id = $1`,
      [input.assistantMessageId, input.text],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
