import { PassThrough, Readable } from "node:stream";

import ExcelJS from "exceljs";

import type { AppLocale } from "@/i18n/messages";

import { loadAccountExportData, type AccountExportData } from "./export-data";

type ExportCell = string | number | boolean | Date | null;
type ExportSheet = {
  name: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, ExportCell>>;
};

const MAX_CELL_TEXT_LENGTH = 30_000;

function jsonChunks(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += MAX_CELL_TEXT_LENGTH) {
    chunks.push(text.slice(start, start + MAX_CELL_TEXT_LENGTH));
  }
  return chunks.length ? chunks : [""];
}

function localizedSheets(
  data: AccountExportData,
  locale: AppLocale,
): ExportSheet[] {
  const zh = locale === "zh-CN";
  const names = zh
    ? [
        "账号资料",
        "简历列表",
        "当前简历内容",
        "历史版本内容",
        "AI 对话与消息",
        "AI 用量",
        "邀请记录",
      ]
    : [
        "Account",
        "Resumes",
        "Current resume content",
        "Resume history",
        "AI conversations",
        "AI usage",
        "Invitations",
      ];
  const field = zh ? "项目" : "Field";
  const value = zh ? "值" : "Value";
  const accountRows = [
    [zh ? "导出格式版本" : "Export format version", "1"],
    [zh ? "用户 ID" : "User ID", data.identity.id],
    [zh ? "姓名" : "Name", data.identity.name],
    [zh ? "邮箱" : "Email", data.identity.email],
    [zh ? "邮箱已验证" : "Email verified", data.identity.emailVerified],
    [zh ? "账号状态" : "Account status", data.lifecycle.status],
    [zh ? "登录方式" : "Sign-in providers", data.providers.join(", ")],
    [zh ? "创建时间" : "Created at", data.identity.createdAt],
    [zh ? "更新时间" : "Updated at", data.identity.updatedAt],
    [zh ? "待注销时间" : "Deletion due at", data.lifecycle.deletionDueAt],
  ].map(([label, cellValue]) => ({ field: label, value: cellValue }));

  return [
    {
      name: names[0]!,
      columns: [
        { header: field, key: "field", width: 26 },
        { header: value, key: "value", width: 48 },
      ],
      rows: accountRows,
    },
    {
      name: names[1]!,
      columns: [
        { header: "ID", key: "id", width: 38 },
        { header: zh ? "名称" : "Name", key: "name", width: 30 },
        { header: zh ? "摘要" : "Summary", key: "summary", width: 42 },
        { header: zh ? "类型" : "Type", key: "kind", width: 16 },
        { header: zh ? "版本" : "Version", key: "version", width: 12 },
        { header: zh ? "已发布" : "Published", key: "published", width: 12 },
        { header: zh ? "公开标识" : "Public slug", key: "slug", width: 28 },
        { header: zh ? "创建时间" : "Created at", key: "createdAt", width: 22 },
        { header: zh ? "更新时间" : "Updated at", key: "updatedAt", width: 22 },
      ],
      rows: data.resumes.map((resume) => ({
        id: resume.id,
        name: resume.name,
        summary: resume.summary,
        kind: resume.kind,
        version: resume.version,
        published: resume.published,
        slug: resume.slug,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      })),
    },
    {
      name: names[2]!,
      columns: [
        { header: zh ? "简历 ID" : "Resume ID", key: "resumeId", width: 38 },
        { header: zh ? "简历名称" : "Resume name", key: "resumeName", width: 30 },
        { header: zh ? "内容段" : "Part", key: "part", width: 10 },
        { header: zh ? "结构化内容" : "Structured content", key: "content", width: 100 },
      ],
      rows: data.resumes.flatMap((resume) =>
        jsonChunks(resume.document).map((content, index) => ({
          resumeId: resume.id,
          resumeName: resume.name,
          part: index + 1,
          content,
        }))),
    },
    {
      name: names[3]!,
      columns: [
        { header: zh ? "快照 ID" : "Snapshot ID", key: "id", width: 38 },
        { header: zh ? "简历 ID" : "Resume ID", key: "resumeId", width: 38 },
        { header: zh ? "版本" : "Version", key: "version", width: 12 },
        { header: zh ? "内容段" : "Part", key: "part", width: 10 },
        { header: zh ? "结构化内容" : "Structured content", key: "content", width: 100 },
        { header: zh ? "创建时间" : "Created at", key: "createdAt", width: 22 },
      ],
      rows: data.versions.flatMap((snapshot) =>
        jsonChunks(snapshot.document).map((content, index) => ({
          id: snapshot.id,
          resumeId: snapshot.resumeId,
          version: snapshot.version,
          part: index + 1,
          content,
          createdAt: snapshot.createdAt,
        }))),
    },
    {
      name: names[4]!,
      columns: [
        { header: zh ? "对话 ID" : "Conversation ID", key: "conversationId", width: 38 },
        { header: zh ? "简历 ID" : "Resume ID", key: "resumeId", width: 38 },
        { header: zh ? "标题" : "Title", key: "title", width: 30 },
        { header: zh ? "范围" : "Scope", key: "contextScope", width: 14 },
        { header: zh ? "消息序号" : "Sequence", key: "sequence", width: 12 },
        { header: zh ? "角色" : "Role", key: "role", width: 14 },
        { header: zh ? "消息内容" : "Message", key: "text", width: 100 },
        { header: zh ? "状态" : "State", key: "completionState", width: 16 },
        { header: zh ? "创建时间" : "Created at", key: "messageCreatedAt", width: 22 },
      ],
      rows: data.conversations.map((row) => ({
        conversationId: row.conversationId,
        resumeId: row.resumeId,
        title: row.title,
        contextScope: row.contextScope,
        sequence: row.sequence,
        role: row.role,
        text: row.text?.slice(0, MAX_CELL_TEXT_LENGTH) ?? null,
        completionState: row.completionState,
        messageCreatedAt: row.messageCreatedAt ?? row.conversationCreatedAt,
      })),
    },
    {
      name: names[5]!,
      columns: [
        { header: "ID", key: "id", width: 38 },
        { header: zh ? "记录类型" : "Entry type", key: "entryType", width: 18 },
        { header: zh ? "点数变化" : "Point change", key: "pointsDelta", width: 16 },
        { header: zh ? "输入令牌" : "Input tokens", key: "inputTokens", width: 16 },
        { header: zh ? "缓存输入令牌" : "Cached input tokens", key: "cachedInputTokens", width: 20 },
        { header: zh ? "输出令牌" : "Output tokens", key: "outputTokens", width: 16 },
        { header: zh ? "创建时间" : "Created at", key: "createdAt", width: 22 },
      ],
      rows: data.usage.map((entry) => ({
        id: entry.id,
        entryType: entry.entryType,
        pointsDelta: entry.pointsDelta,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        outputTokens: entry.outputTokens,
        createdAt: entry.createdAt,
      })),
    },
    {
      name: names[6]!,
      columns: [
        { header: "ID", key: "id", width: 38 },
        { header: zh ? "邀请邮箱" : "Invited email", key: "invitedEmail", width: 36 },
        { header: zh ? "发送时间" : "Last sent at", key: "lastSentAt", width: 22 },
        { header: zh ? "过期时间" : "Expires at", key: "expiresAt", width: 22 },
        { header: zh ? "接受时间" : "Accepted at", key: "acceptedAt", width: 22 },
        { header: zh ? "撤销时间" : "Revoked at", key: "revokedAt", width: 22 },
        { header: zh ? "失效原因" : "Invalidation reason", key: "invalidationReason", width: 28 },
        { header: zh ? "创建时间" : "Created at", key: "createdAt", width: 22 },
      ],
      rows: data.invitations.map((invitation) => ({
        id: invitation.id,
        invitedEmail: invitation.invitedEmail,
        lastSentAt: invitation.lastSentAt,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        invalidationReason: invitation.invalidationReason,
        createdAt: invitation.createdAt,
      })),
    },
  ];
}

export async function streamAccountExport(
  userId: string,
  locale: AppLocale,
): Promise<ReadableStream<Uint8Array>> {
  const data = await loadAccountExportData(userId);
  const output = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useStyles: true,
    useSharedStrings: true,
  });

  void (async () => {
    try {
      for (const sheet of localizedSheets(data, locale)) {
        const worksheet = workbook.addWorksheet(sheet.name, {
          views: [{ state: "frozen", ySplit: 1 }],
        });
        worksheet.columns = sheet.columns;
        const header = worksheet.getRow(1);
        header.font = { bold: true };
        header.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3E4EA" },
        };
        for (const row of sheet.rows) worksheet.addRow(row).commit();
        worksheet.commit();
      }
      await workbook.commit();
    } catch (error) {
      output.destroy(error instanceof Error ? error : new Error("export_failed"));
    }
  })();

  return Readable.toWeb(output) as ReadableStream<Uint8Array>;
}
