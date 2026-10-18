import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { initializeLogCapture } from "../../../support/observability";

describe("configuration API errors", () => {
  it("logs unknown failures without raw configuration details", async () => {
    const capture = initializeLogCapture();
    const response = configurationApiErrorResponse(
      new Error("SMTP_PASSWORD=configuration-secret"),
    );

    expect(response.status).toBe(500);
    expect(capture.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "event.action": "operation_failed",
          "event.dataset": "anonresume.configuration",
          "event.outcome": "failure",
        }),
      ]),
    );
    expect(capture.lines.join("\n")).not.toContain("configuration-secret");
  });
});
