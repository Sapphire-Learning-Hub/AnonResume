import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";

const accountLog = getLogger("anonresume.account");

export async function deliverPostCommitAccountNotice(
  deliver: () => Promise<void>,
  event: string,
) {
  try {
    await deliver();
  } catch (error) {
    accountLog.error("security_notice_delivery_failed", {
      error: serializeSafeError(error),
      labels: { noticeType: event },
      outcome: "failure",
    });
  }
}
