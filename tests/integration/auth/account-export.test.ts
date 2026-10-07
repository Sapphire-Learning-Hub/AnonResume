import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";

import { db, resumeVersions, resumes, userInvitations } from "@/db";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import { streamAccountExport } from "@/lib/auth/account/export-workbook";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account Excel export", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db
        .delete(userInvitations)
        .where(eq(userInvitations.inviterUserId, userId));
      await db.delete(resumes).where(eq(resumes.userId, userId));
      await getDatabasePool().query(
        `DELETE FROM "account" WHERE "userId" = $1`,
        [userId],
      );
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [
        userId,
      ]);
    }
  });

  it("exports seven readable sheets without credential or token data", async () => {
    const userId = `account-export-${randomUUID()}`;
    const resumeId = `resume-${randomUUID()}`;
    const email = `${userId}@example.com`;
    const credentialSecret = "never-export-this-password-hash";
    userIds.push(userId);
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Export User', $2, true, now(), now())`,
      [userId, email],
    );
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, now(), now(), 'credential')`,
      [randomUUID(), userId, credentialSecret],
    );
    const document = createEditorOnboardingDocument("zh-CN");
    document.meta.title = "导出测试简历";
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      name: "导出测试简历",
      summary: "供个人查阅",
      document,
      version: 2,
    });
    await db.insert(resumeVersions).values({
      id: randomUUID(),
      userId,
      resumeId,
      version: 1,
      document,
    });
    await db.insert(userInvitations).values({
      inviterUserId: userId,
      invitedEmail: "friend@example.com",
      tokenHash: "never-export-this-invitation-token",
      lastSentAt: new Date("2026-10-07T00:00:00.000Z"),
      expiresAt: new Date("2026-10-14T00:00:00.000Z"),
    });

    const stream = await streamAccountExport(userId, "zh-CN");
    const bytes = await new Response(stream).arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "账号资料",
      "简历列表",
      "当前简历内容",
      "历史版本内容",
      "AI 对话与消息",
      "AI 用量",
      "邀请记录",
    ]);
    const values = workbook.worksheets
      .flatMap((sheet) => sheet.getSheetValues())
      .flat(3)
      .filter((value): value is string | number | boolean | Date =>
        value !== null && value !== undefined && typeof value !== "object" ||
        value instanceof Date,
      )
      .join("\n");
    expect(values).toContain("Export User");
    expect(values).toContain("导出测试简历");
    expect(values).toContain("friend@example.com");
    expect(values).not.toContain(credentialSecret);
    expect(values).not.toContain("never-export-this-invitation-token");
    expect(values.toLowerCase()).not.toContain("password");
    expect(values.toLowerCase()).not.toContain("token_hash");
  });
});
