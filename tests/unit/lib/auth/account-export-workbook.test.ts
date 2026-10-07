import ExcelJS from "exceljs";

const longMessage = `${"甲".repeat(29_999)}😀${"乙".repeat(12_000)}`;

vi.mock("@/lib/auth/account/export-data", () => ({
  loadAccountExportData: vi.fn(async () => ({
    identity: {
      id: "user-1",
      name: "Export User",
      email: "export@example.com",
      emailVerified: true,
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    lifecycle: {
      status: "active",
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
      explicit: false,
    },
    providers: ["credential"],
    resumes: [],
    versions: [],
    conversations: [{
      conversationId: "conversation-1",
      resumeId: "resume-1",
      title: "Long message",
      contextScope: "resume",
      sectionId: null,
      archivedAt: null,
      deletedAt: null,
      conversationCreatedAt: new Date("2026-10-01T00:00:00.000Z"),
      messageId: "message-1",
      role: "user",
      text: longMessage,
      sequence: 1,
      completionState: "complete",
      messageCreatedAt: new Date("2026-10-01T00:00:00.000Z"),
    }],
    usage: [],
    invitations: [],
  })),
}));

import { streamAccountExport } from "@/lib/auth/account/export-workbook";

describe("account export workbook", () => {
  it("preserves long AI messages across ordered workbook rows", async () => {
    const stream = await streamAccountExport("user-1", "zh-CN");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await new Response(stream).arrayBuffer());

    const sheet = workbook.getWorksheet("AI 对话与消息")!;
    const headerValues = sheet.getRow(1).values;
    const messageColumn = Array.isArray(headerValues)
      ? headerValues.findIndex((value) => value === "消息内容")
      : -1;
    expect(messageColumn).toBeGreaterThan(0);
    const messageParts = sheet.getRows(2, sheet.rowCount - 1)!
      .map((row) => String(row.getCell(messageColumn).value ?? ""));

    expect(messageParts).toHaveLength(2);
    expect(messageParts.join("")).toBe(longMessage);
  });
});
