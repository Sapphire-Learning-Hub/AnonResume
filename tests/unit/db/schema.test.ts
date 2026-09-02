import { getTableConfig } from "drizzle-orm/pg-core";

import { pdfExportJobs, resumes, resumeVersions } from "@/db/schema";

describe("database schema contracts", () => {
  it("keeps public resume slugs globally unique", () => {
    const config = getTableConfig(resumes);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      "resumes_slug_unique",
    );
  });

  it("deletes version snapshots when their resume is deleted", () => {
    const config = getTableConfig(resumeVersions);
    const resumeForeignKey = config.foreignKeys.find(
      (foreignKey) => foreignKey.reference().foreignTable === resumes,
    );

    expect(resumeForeignKey?.onDelete).toBe("cascade");
  });

  it("indexes queued PDF exports for FIFO claims and user status reads", () => {
    const config = getTableConfig(pdfExportJobs);
    const indexNames = config.indexes.map((index) => index.config.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "pdf_export_jobs_status_created_at_idx",
        "pdf_export_jobs_requester_created_at_idx",
      ]),
    );
  });
});
