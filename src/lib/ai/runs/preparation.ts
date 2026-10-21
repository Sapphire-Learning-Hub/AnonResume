import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { aiRuns, db, resumes } from "@/db";
import { AiConversationNotFoundError } from "@/lib/ai/conversations/repository";
import { AiRunAlreadyActiveError, AiRunRateLimitedError, type AiRunConfiguration } from "./service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function admitAiRun<T>(input: { userId: string; resumeId: string; configuration: AiRunConfiguration; now: Date }, work: (transaction: Transaction) => Promise<T>) {
  return db.transaction(async (transaction) => {
    const [resume] = await transaction.select({ id: resumes.id }).from(resumes)
      .where(and(eq(resumes.userId, input.userId), eq(resumes.id, input.resumeId), isNull(resumes.deletedAt)))
      .for("share").limit(1);
    if (!resume) throw new AiConversationNotFoundError();
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:ai-admission:${input.userId}`}))`);
    const [recent] = await transaction.select({ total: count() }).from(aiRuns).where(and(eq(aiRuns.userId, input.userId), gt(aiRuns.createdAt, new Date(input.now.getTime() - 60_000))));
    if (recent!.total >= input.configuration.requestsPerMinute) throw new AiRunRateLimitedError();
    const [active] = await transaction.select({ total: count() }).from(aiRuns).where(and(eq(aiRuns.userId, input.userId), inArray(aiRuns.status, ["queued", "preparing", "streaming"])));
    if (active!.total >= (input.configuration.maxConcurrentRuns ?? 1)) throw new AiRunAlreadyActiveError();
    const [sameResume] = await transaction.select({ id: aiRuns.id }).from(aiRuns).where(and(eq(aiRuns.userId, input.userId), eq(aiRuns.resumeId, input.resumeId), inArray(aiRuns.status, ["queued", "preparing", "streaming"]))).limit(1);
    if (sameResume) throw new AiRunAlreadyActiveError();
    return work(transaction);
  });
}
