import { getTableColumns } from "drizzle-orm";

import { pdfExportJobs, resumes, resumeVersions } from "@/db/schema";

describe("database schema", () => {
  it("declares the expected resume columns", () => {
    const columns = Object.keys(getTableColumns(resumes));

    expect(columns).toEqual([
      "id",
      "userId",
      "name",
      "summary",
      "customSummary",
      "slug",
      "document",
      "schemaVersion",
      "version",
      "published",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("declares the expected resume version columns", () => {
    const columns = Object.keys(getTableColumns(resumeVersions));

    expect(columns).toEqual([
      "id",
      "userId",
      "resumeId",
      "version",
      "document",
      "createdAt",
    ]);
  });

  it("declares the PDF export queue columns", () => {
    const columns = Object.keys(getTableColumns(pdfExportJobs));

    expect(columns).toEqual([
      "id",
      "resumeUserId",
      "resumeId",
      "requesterUserId",
      "accessTokenHash",
      "status",
      "document",
      "filename",
      "result",
      "error",
      "cancelRequested",
      "workerId",
      "attempts",
      "leaseExpiresAt",
      "createdAt",
      "startedAt",
      "completedAt",
      "resultExpiresAt",
    ]);
  });
});
