import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Third-party Notices | AnonResume",
};

export default async function ThirdPartyNoticesPage() {
  const content = await readFile(
    join(process.cwd(), "THIRD_PARTY_NOTICES"),
    "utf8",
  );

  return (
    <LegalDocumentPage
      content={content}
      description="Licenses and attribution for bundled fonts, icons, and other third-party assets."
      title="第三方声明 / Third-party notices"
    />
  );
}
