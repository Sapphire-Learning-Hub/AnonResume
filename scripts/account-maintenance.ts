import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";

initializeLogging({ role: "maintenance" });
const accountLog = getLogger("anonresume.account");
const { runAccountMaintenance } = await import("@/lib/auth/account/maintenance");
const { deliverAccountMergeNotices, runAccountMergeExecutor } = await import("@/lib/auth/account/merge/executor");
const { getDatabasePool } = await import("@/lib/runtime/database");
const { cleanupImages } = await import("@/lib/resume/assets/maintenance");
const { sendAccountSecurityNotice } = await import("@/lib/runtime/email");

try {
  const result = await runAccountMaintenance({
    limit: 100,
    notifyDeleted: ({ email, name }) => sendAccountSecurityNotice({
      email,
      name,
      event: "account_deleted",
      locale: "zh-CN",
    }),
  });
  const mergeResult = await runAccountMergeExecutor({ limit: 100 });
  const noticeResult = await deliverAccountMergeNotices({ limit: 100 });
  const imageResult = await cleanupImages({ limit: 100 });
  const failed = result.failed + mergeResult.failed + noticeResult.failed + imageResult.failed;
  accountLog[failed > 0 ? "error" : "info"]("maintenance_completed", {
    labels: {
      completedMerges: mergeResult.completed,
      deletedAccounts: result.deleted,
      removedImages: imageResult.removed,
      failed,
      processedAccounts: result.processed,
      processedMerges: mergeResult.processed,
      waitingMerges: mergeResult.waiting,
    },
    outcome: failed > 0 ? "failure" : "success",
  });
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  accountLog.error("maintenance_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
} finally {
  await getDatabasePool().end();
}
