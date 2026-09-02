import { drizzle } from "drizzle-orm/node-postgres";

import { getDatabasePool } from "@/lib/database";

import { pdfExportJobs, resumes, resumeVersions } from "./schema";

export { getDatabaseSchemaName } from "./schema";
export { pdfExportJobs, resumes, resumeVersions } from "./schema";

export const db = drizzle({
  client: getDatabasePool(),
  schema: {
    resumes,
    resumeVersions,
    pdfExportJobs,
  },
});
