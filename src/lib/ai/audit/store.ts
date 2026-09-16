import { createHash } from "node:crypto";

import { aiAuditPayloads, db } from "@/db";
import {
  decryptAiCredential,
  encryptAiCredential,
} from "@/lib/ai/security/credentials";

export interface EncryptedAiAuditEvidence {
  encryptedRequest: Buffer;
  encryptedResponse: Buffer;
  encryptionKeyVersion: number;
  payloadHash: string;
  expiresAt: Date;
}

export function createEncryptedAiAuditEvidence({
  request,
  response,
  encryptionKey,
  encryptionKeyVersion,
  retentionDays,
  now = new Date(),
}: {
  request: unknown;
  response: unknown;
  encryptionKey: Buffer;
  encryptionKeyVersion: number;
  retentionDays: number;
  now?: Date;
}): EncryptedAiAuditEvidence {
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
    throw new Error("invalid_ai_audit_retention");
  }
  const requestJson = JSON.stringify(request);
  const responseJson = JSON.stringify(response);
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);

  return {
    encryptedRequest: encryptAiCredential(requestJson, encryptionKey),
    encryptedResponse: encryptAiCredential(responseJson, encryptionKey),
    encryptionKeyVersion,
    payloadHash: createHash("sha256")
      .update(requestJson)
      .update("\0")
      .update(responseJson)
      .digest("hex"),
    expiresAt,
  };
}

export function decryptAiAuditEvidence(
  evidence: Pick<
    EncryptedAiAuditEvidence,
    "encryptedRequest" | "encryptedResponse"
  >,
  encryptionKey: Buffer,
) {
  return {
    request: JSON.parse(
      decryptAiCredential(evidence.encryptedRequest, encryptionKey),
    ) as unknown,
    response: JSON.parse(
      decryptAiCredential(evidence.encryptedResponse, encryptionKey),
    ) as unknown,
  };
}

export async function storeAiAuditEvidence(input: {
  runId: string;
  evidence: EncryptedAiAuditEvidence;
}) {
  await db.insert(aiAuditPayloads).values({
    runId: input.runId,
    ...input.evidence,
  });
}
