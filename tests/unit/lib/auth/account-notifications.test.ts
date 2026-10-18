import { deliverPostCommitAccountNotice } from "@/lib/auth/account/notifications";
import { initializeLogCapture } from "../../../support/observability";

describe("post-commit account notices", () => {
  it("logs delivery failures without account or message details", async () => {
    const capture = initializeLogCapture();

    await deliverPostCommitAccountNotice(
      () => Promise.reject(new Error("private@example.com secret notice")),
      "email_changed",
    );

    expect(capture.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "event.action": "security_notice_delivery_failed",
          "event.dataset": "anonresume.account",
          "event.outcome": "failure",
        }),
      ]),
    );
    expect(capture.lines.join("\n")).not.toContain("private@example.com");
    expect(capture.lines.join("\n")).not.toContain("secret notice");
  });
});
